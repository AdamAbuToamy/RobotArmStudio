// Robot Arm Studio v20 -- ESP32-S3 + PCA9685, channels 0..5; MG90S on 3..5.
// USB CDC On Boot: Disabled for the UART USB port used in this project.
// Values are commanded pulse widths, NOT measured joint angles.
#include <SPI.h>
#include <Preferences.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

Adafruit_PWMServoDriver pwm(0x40);
const int JOINTS = 6;
int MIN_US[JOINTS] = {800, 800, 800, 800, 800, 810}; // First two ranges are user-reported; remaining ranges require mechanical calibration.
int MAX_US[JOINTS] = {2200, 2200, 2200, 2200, 2200, 1710};
const int CENTER_US = 1500;
const int ACTIVATE_US[JOINTS] = {1100, 1030, 1650, 1640, 1400, 1480};
const int MAX_JOG_SPEED[JOINTS] = {4000, 4000, 4000, 600, 600, 250}; // Command pulse slew in us/sec; actual servo speed is hardware-limited.
const unsigned long WATCHDOG_MS = 600;
// Default: release MG90S after the last actual pulse-target change.
// Explicit HOLD90 enables load holding (can cause stall/heat). No stall sensing.
const unsigned long IDLE_RELEASE_MS = 750;
bool holdMG90 = false, gripRelaxed = false;
bool idleLatched[JOINTS] = {false,false,false,false,false,false};
bool outputOn[JOINTS] = {false, false, false, false, false, false};
unsigned long lastOutput[JOINTS] = {0, 0, 0, 0, 0, 0};
bool idleReleaseJoint(int ch) { return ch >= 3 && ch <= 5; }
const float MAX_PATH_SPEED[JOINTS] = {600, 600, 600, 300, 300, 150}; // us/sec, peak speed of smooth moves.
float pos[JOINTS] = {1500, 1500, 1500, 1500, 1500, 1500};
bool initialized[JOINTS] = {false, false, false, false, false, false};
bool armed[JOINTS] = {false, false, false, false, false, false};
bool ready = false;
int jogJoint = -1, jogDir = 0, jogSpeed = 250;
float jogVelocity = 0, jogAcceleration = 0;
bool jogBraking = false;
unsigned long brakeStarted = 0;
float brakeStartPos = 0;
const unsigned long BRAKE_MAX_MS = 350;
const float BRAKE_MAX_TRAVEL[JOINTS] = {30, 25, 25, 15, 15, 8};
const float MAX_ACCEL[JOINTS] = {2000, 1200, 1500, 700, 700, 400};
const float MAX_JERK[JOINTS] = {16000, 10000, 12000, 6000, 6000, 4000};
int lastTicks[JOINTS] = {-1, -1, -1, -1, -1, -1};
float gripStartPos = 1500;
unsigned long gripMoveStart = 0, gripMoveDuration = 200;
const float VELOCITY_RESPONSE = 14; // Critically damped velocity response, 1/s.
bool gripping = false, gripHolding = false;
int gripTarget = 1500;
bool moving = false;
float startPos[JOINTS], endPos[JOINTS];
unsigned long moveStart = 0, moveDuration = 0, moveId = 0;
unsigned long lastAlive = 0, lastJog = 0, lastStep = 0, lastReport = 0;
char line[128];
size_t used = 0;
bool overflow = false;

// Uploaded sequence: fixed memory, no movement until validated SEQRUN.
const int MAX_POINTS=100;
struct Waypoint { float p[JOINTS]; unsigned long ms,hold; int finger=0,fingerUs=1500; unsigned long settle=0; };
Waypoint path[MAX_POINTS+1];
int pathCount=0,pathUploaded=0,pathIndex=1,pathRate=1000;
bool pathManagedFingers=false,pathActionDone=false;
bool pathBlend=true,sequenceActive=false,sequenceSkipFingers=false,pendingFingerOverride=false;
// Two keyboard/pad axes can move together with independent smoothing.
int dualCh[2]={-1,-1},dualDir[2]={0,0},dualSpeed[2]={250,250};
float dualVelocity[2]={0,0},dualAcceleration[2]={0,0};
unsigned long dualLast=0,dualBrakeStart[2]={0,0};
float dualBrakePos[2]={0,0};
bool dualActive=false;
float pathTangent(int i,int ch){
 if(!pathBlend || i<=0 || i>=pathCount || path[i].hold) return 0;
 float a=(path[i].p[ch]-path[i-1].p[ch])/(path[i].ms/1000.0f);
 float b=(path[i+1].p[ch]-path[i].p[ch])/(path[i+1].ms/1000.0f);
 if(a*b<=0)return 0;
 float v=2*a*b/(a+b),limit=1.25f*fminf(fabsf(a),fabsf(b));
 return fmaxf(-limit,fminf(limit,v));
}
void pathControls(int i,int ch,float b[6]){
 float t=path[i].ms/1000.0f,p=path[i-1].p[ch],q=path[i].p[ch];
 float u=pathTangent(i-1,ch)*t/5,v=pathTangent(i,ch)*t/5;
 b[0]=p;b[1]=p+u;b[2]=p+2*u;b[3]=q-2*v;b[4]=q-v;b[5]=q;
}
float bezier(const float* b,int degree,float t){
 float w[6];for(int k=0;k<=degree;k++)w[k]=b[k];
 for(int d=degree;d>0;d--)for(int k=0;k<d;k++)w[k]+=(w[k+1]-w[k])*t;
 return w[0];
}
// Sample bound plus Lipschitz margin from the next Bezier derivative hull.
float derivativeBound(float* b,int degree){
 float bound=0,next=0;
 for(int j=0;j<=64;j++)bound=fmaxf(bound,fabsf(bezier(b,degree,j/64.0f)));
 for(int j=0;j<degree;j++)next=fmaxf(next,fabsf(degree*(b[j+1]-b[j])));
 return bound+next/128.0f;
}
bool planSequence(){
 pathManagedFingers=false;
 for(int i=1;i<=pathCount;i++)if(path[i].finger!=0)pathManagedFingers=true;
 bool expectedGrip=gripping;int expectedUs=gripping?gripTarget:(int)lroundf(pos[5]);
 for(int i=1;i<=pathCount;i++){
  int action=path[i].finger,us=path[i].fingerUs;
  bool changes=(action==2&&(!expectedGrip||expectedUs!=us)) || (action==3&&(expectedGrip||expectedUs!=us));
  if(changes&&!pendingFingerOverride)path[i].hold+=path[i].settle;
  if(action==2){expectedGrip=true;expectedUs=us;}
  else if(action==3){expectedGrip=false;expectedUs=us;}
  else if(action==4)expectedGrip=false;
  else if(action==0&&!expectedGrip)expectedUs=us;
 }

 for(int ch=0;ch<JOINTS;ch++)path[0].p[ch]=pos[ch];
 path[0].ms=0;path[0].hold=0;
 for(int i=1;i<=pathCount;i++){
  unsigned long minimum=200;
  for(int ch=0;ch<JOINTS;ch++){
   if(ch==5&&(gripping||pathManagedFingers))path[i].p[ch]=pos[ch];
   float cap=fminf(MAX_JOG_SPEED[ch],MAX_PATH_SPEED[ch]*pathRate/1000.0f);
   unsigned long need=(unsigned long)ceilf(1000*fabsf(path[i].p[ch]-path[i-1].p[ch])/cap);
   if(need>minimum)minimum=need;
  }
  if(path[i].ms<minimum)path[i].ms=minimum;
 }
 for(int pass=0;pass<3;pass++){
  float scale=1;
  for(int i=1;i<=pathCount;i++)for(int ch=0;ch<JOINTS;ch++){
   float b[6];pathControls(i,ch,b);float seconds=path[i].ms/1000.0f;
   for(int order=1;order<=3;order++){
    int degree=6-order;
    for(int k=0;k<degree;k++)b[k]=degree*(b[k+1]-b[k]);
    float peak=derivativeBound(b,degree-1)/powf(seconds,order);
    float cap=order==1?fminf(MAX_JOG_SPEED[ch],MAX_PATH_SPEED[ch]*pathRate/1000.0f):order==2?MAX_ACCEL[ch]:MAX_JERK[ch];
    scale=fmaxf(scale,powf(peak/cap,1.0f/order));
   }
  }
  if(scale<=1.001f)break;
  for(int i=1;i<=pathCount;i++){
   path[i].ms=(unsigned long)ceilf(path[i].ms*scale*1.01f);
   if(path[i].ms>120000)return false;
  }
 }
 return true;
}

bool anyArmed(){ for(int ch=0;ch<JOINTS;ch++) if(armed[ch]) return true; return false; }
void disarmAll(){ for(int ch=0;ch<JOINTS;ch++) armed[ch]=false; }
void haltMotion() { sequenceActive=false; dualActive=false; moving = false; jogJoint = -1; jogDir = 0; jogVelocity = 0; jogAcceleration = 0; jogBraking = false; }
void cancelGrip() { gripping = false; gripHolding = false; gripRelaxed=false; }
float smoothPosition(float t) { return fmaxf(0.0f,fminf(1.0f,t*t*t*(10.0f+t*(-15.0f+6.0f*t)))); }
unsigned long smoothDuration(int ch, float distance, float speedCap) {
  distance = fabsf(distance);
  if (distance < 0.0001f) return 0;
  float bySpeed = 1.875f * distance / speedCap;
  float byAcceleration = sqrtf(5.773503f * distance / MAX_ACCEL[ch]);
  float byJerk = cbrtf(60.0f * distance / MAX_JERK[ch]);
  return (unsigned long)ceilf(1000.0f*fmaxf(bySpeed,fmaxf(byAcceleration,byJerk)));
}
void beginBrake() {
  if (jogJoint >= 0 && !jogBraking) {
    jogDir = 0; jogBraking = true;
    brakeStarted = millis(); brakeStartPos = pos[jogJoint];
  }
}
void ack(unsigned long id) { if (id) Serial.printf("ACK %lu\n", id); }
void error(unsigned long id, const char* reason) { Serial.printf("ERR %lu %s\n", id, reason); }
Preferences calibration;
void reportLimits() {
  Serial.print("LIMITS20");
  for(int ch=0;ch<JOINTS;ch++) Serial.printf(" %d %d",MIN_US[ch],MAX_US[ch]);
  Serial.println();
}
void state() {
  Serial.printf("STATE20");
  for(int ch=0;ch<JOINTS;ch++) Serial.printf(" %d", (int)lroundf(pos[ch]));
  for(int ch=0;ch<JOINTS;ch++) Serial.printf(" %d", armed[ch]);
  unsigned int outputMask=0;for(int c=0;c<JOINTS;c++)if(outputOn[c])outputMask|=1u<<c;
  Serial.printf(" %d %d %d %d %d %d %d %u\n", ready, moving || jogJoint >= 0 || dualActive, gripping, gripTarget, gripHolding, holdMG90, gripRelaxed,outputMask);
}
bool releaseJoint(int ch) {
  if (!outputOn[ch]) return true;
  if (pwm.setPWM(ch, 0, 4096) != 0) {
    ready = false; disarmAll(); haltMotion(); cancelGrip();
    Serial.println("FAULT RELEASE_FAILED"); return false;
  }
  outputOn[ch] = false; return true;
}
void releaseIdleOutputs(bool immediately = false) {
  for (int ch = 0; ch < JOINTS; ch++) {
    if (!idleReleaseJoint(ch) || !outputOn[ch]) continue;
    bool keep = holdMG90 && armed[ch] && ((ch==3 || ch==4) || (ch==5 && gripping));
    if (immediately || (!keep && millis() - lastOutput[ch] >= IDLE_RELEASE_MS)) {
      if(ch==5 && gripping){gripRelaxed=true;gripHolding=true;}
      if (!releaseJoint(ch)) return;
      idleLatched[ch]=true;
    }
  }
}
bool writeJoint(int ch) {
  // PCA9685 counts at nominal 50 Hz. Hardware oscillator tolerance remains.
  int ticks = (int)lroundf(pos[ch] * 4096.0f / 20000.0f);
  // An unchanged target must not renew the idle timer or periodically re-enable PWM.
  if (lastTicks[ch] == ticks && (outputOn[ch] || idleLatched[ch])) return true;
  idleLatched[ch]=false;
  if (pwm.setPWM(ch, 0, ticks) != 0) {
    ready = false; disarmAll(); haltMotion(); cancelGrip();
    Serial.println("FAULT I2C_WRITE"); return false;
  }
  lastTicks[ch] = ticks;
  outputOn[ch] = true; lastOutput[ch] = millis();
  return true;
}
void planMove(int target[JOINTS], unsigned long duration, int rate, unsigned long id) {
    haltMotion();
    unsigned long minimum = 0;
    for (int ch = 0; ch < JOINTS; ch++) {
      if (ch == 5 && gripping) target[ch] = (int)lroundf(pos[ch]);
      startPos[ch] = pos[ch]; endPos[ch] = target[ch];
      float cap = fminf(MAX_JOG_SPEED[ch], MAX_PATH_SPEED[ch] * rate / 1000.0f);
      unsigned long needed = (unsigned long)smoothDuration(ch, target[ch]-pos[ch], cap);
      if(needed>minimum) minimum=needed;
    }
    moveDuration = duration > minimum ? duration : minimum;
    moveStart = lastAlive = millis(); moveId = id; moving = true;
    ack(id); Serial.printf("PLAN %lu %lu\n", id, moveDuration);
}
bool applyFingerAction(int index){
 if(sequenceSkipFingers || !pathManagedFingers)return true;
 int action=path[index].finger,target=path[index].fingerUs;
 if(action==1)return true; // Keep the existing finger state.
 if(action==2){
  // No feedback or force sensing: fixed calibrated target, never an increasing squeeze loop.
  if(gripping&&gripHolding&&gripTarget==target)return true;
  gripping=gripHolding=true;gripTarget=target;pos[5]=target;idleLatched[5]=false;gripRelaxed=false;lastOutput[5]=millis();
  if(!writeJoint(5))return false;
  Serial.println("INFO GRIP_HOLDING");return true;
 }
 if(action==4){cancelGrip();return releaseJoint(5);}
 if(action==3){cancelGrip();pos[5]=target;idleLatched[5]=false;gripRelaxed=false;lastOutput[5]=millis();return writeJoint(5);}
 if(action==0&&!gripping){pos[5]=target;return writeJoint(5);}
 return true;
}
void handle(char* text) {
  unsigned long id;
  char op[16];
  int offset = 0;
  if (sscanf(text, "%lu %15s %n", &id, op, &offset) != 2) return;
  char* args = text + offset;
  char extra;
  if (!strcmp(op, "HELLO")) {
    haltMotion(); cancelGrip(); disarmAll(); holdMG90=false; releaseIdleOutputs(true);
    lastAlive = millis();
    Serial.println("RAS20"); reportLimits(); ack(id); state(); return;
  }
  if (!strcmp(op, "PING")) { lastAlive = millis(); ack(id); return; }
  if (!strcmp(op, "STOP")) {
    haltMotion(); cancelGrip(); releaseIdleOutputs(true);
    lastAlive = millis(); ack(id); state(); return;
  }
  if (!strcmp(op, "BRAKE")) {
    if(dualActive){for(int k=0;k<2;k++){dualDir[k]=0;dualBrakeStart[k]=millis();dualBrakePos[k]=pos[dualCh[k]];}dualLast=millis();}
    beginBrake(); lastAlive = millis(); ack(id); state(); return;
  }
  if (!strcmp(op, "STOPMOVE")) {
    haltMotion(); lastAlive = millis(); ack(id); state(); return;
  }
  if (!ready) { error(id, "DRIVER_NOT_FOUND"); return; }
  if (!strcmp(op,"HOLD90")) {
    int enabled;
    if(sscanf(args,"%d %c",&enabled,&extra)!=1 || (enabled!=0&&enabled!=1)){error(id,"BAD_HOLD90");return;}
    // Changing policy never energizes a released output or sends a new target.
    holdMG90=enabled;lastAlive=millis();releaseIdleOutputs();ack(id);state();return;
  }
  if (!strcmp(op,"LIMITS")) {
    int ch,lo,hi;
    if(sscanf(args,"%d %d %d %c",&ch,&lo,&hi,&extra)!=3 || ch<0 || ch>4 ||
       lo<500 || hi>2500 || lo>=hi || lo>ACTIVATE_US[ch] || hi<ACTIVATE_US[ch] ||
       (initialized[ch] && (pos[ch]<lo || pos[ch]>hi))) { error(id,"BAD_LIMITS");return; }
    if(moving || jogJoint>=0 || dualActive || gripping){error(id,"BUSY_LIMITS");return;}
    // Store one packed pair atomically; apply only after the NVS write succeeds.
    char key[8];snprintf(key,sizeof(key),"lim%d",ch);
    unsigned int packed=((unsigned int)lo<<16)|(unsigned int)hi;
    if(calibration.putUInt(key,packed)!=sizeof(unsigned int)){error(id,"LIMITS_SAVE_FAILED");return;}
    MIN_US[ch]=lo;MAX_US[ch]=hi;
    lastAlive=millis();reportLimits();ack(id);state();return;
  }
  if (!strcmp(op, "ARMALL")) {
    if (sscanf(args, " %c", &extra) == 1) { error(id, "BAD_ARMALL"); return; }
    int target[JOINTS];
    for (int i=0;i<JOINTS;i++) {
      target[i]=ACTIVATE_US[i];
      if (target[i]<MIN_US[i] || target[i]>MAX_US[i]) { error(id,"BAD_ACTIVATE_POSITION"); return; }
    }
    haltMotion(); cancelGrip();
    // First output cannot be ramped from an unknown physical position.
    // Previously initialized channels use the shared smooth planner below.
    for (int i=0;i<JOINTS;i++) {
      if (!initialized[i]) {
        pos[i]=target[i];idleLatched[i]=false;
        if (!writeJoint(i)) { error(id,"I2C_WRITE"); return; }
        initialized[i]=true;
      }
      armed[i]=true;
      if(pos[i]==target[i] && idleLatched[i]){idleLatched[i]=false;lastOutput[i]=millis();if(!writeJoint(i))return;}
    }
    lastAlive=millis();
    planMove(target,2000,1000,id); state(); return;
  }
  if (!strcmp(op, "OPENFAST")) {
    int target;
    if (sscanf(args,"%d %c",&target,&extra)!=1 || target<MIN_US[5] || target>MAX_US[5]) {
      error(id,"BAD_OPEN_POSITION"); return;
    }
    if (!armed[5]) { error(id,"NOT_ARMED"); return; }
    cancelGrip();
    if(sequenceActive)sequenceSkipFingers=true;else if(pathCount>0)pendingFingerOverride=true;
    if (jogJoint==5) { jogJoint=-1; jogDir=0; jogVelocity=0; jogAcceleration=0; jogBraking=false; }
    // Do not allow a saved finger path to close again after the direct open.
    if (moving) startPos[5]=endPos[5]=target;
    pos[5]=target;idleLatched[5]=false;gripRelaxed=false;lastOutput[5]=millis();
    if (!writeJoint(5)) { error(id,"I2C_WRITE"); return; }
    lastAlive=millis(); ack(id); state(); return;
  }
  if (!strcmp(op, "RELEASE_GRIP")) {
    cancelGrip(); if(sequenceActive)sequenceSkipFingers=true;else if(pathCount>0)pendingFingerOverride=true;
    if (moving) startPos[5] = endPos[5] = pos[5];
    if (jogJoint == 5) { jogDir = 0; jogJoint = -1; jogVelocity = 0; jogAcceleration = 0; jogBraking = false; }
    if (!releaseJoint(5)) return;
    lastAlive = millis(); ack(id); state(); return;
  }
  if (!strcmp(op, "GRIP") || !strcmp(op, "GRIPFAST")) {
    bool fast = !strcmp(op, "GRIPFAST");
    int target;
    if (sscanf(args, "%d %c", &target, &extra) != 1 ||
        target < MIN_US[5] || target > MAX_US[5]) {
      error(id, "BAD_GRIP"); return;
    }
    if (!armed[5]) { error(id, "NOT_ARMED"); return; }
    if (gripping && !fast) { error(id, "GRIP_ALREADY_ACTIVE"); return; }
    if (jogJoint == 5) { jogJoint = -1; jogDir = 0; jogVelocity = 0; jogAcceleration = 0; jogBraking = false; }
    idleLatched[5]=false;gripRelaxed=false;lastOutput[5]=millis();
    gripTarget = target; gripHolding = false;
    gripStartPos = pos[5]; gripMoveStart = millis();
    gripMoveDuration = smoothDuration(5, target-pos[5], MAX_JOG_SPEED[5]);
    if (gripMoveDuration < 200) gripMoveDuration = 200;
    lastAlive = millis(); gripping = true;
    if (fast) {
      // Explicit direct close: servo hardware determines physical travel speed.
      pos[5] = target;
      if (!writeJoint(5)) { error(id,"I2C_WRITE"); return; }
      gripHolding = true;
    }
    ack(id); state(); return;
  }
  if(!strcmp(op,"JOG2")){
    int c[2],d[2],v[2];
    if(sscanf(args,"%d %d %d %d %d %d %c",&c[0],&d[0],&v[0],&c[1],&d[1],&v[1],&extra)!=6){error(id,"BAD_JOG2");return;}
    for(int k=0;k<2;k++)if(c[k]<0||c[k]>=JOINTS||d[k]<-1||d[k]>1||v[k]<50||v[k]>MAX_JOG_SPEED[c[k]]||(!armed[c[k]]&&d[k])||(c[k]==5&&gripping&&d[k])){error(id,"BAD_JOG2");return;}
    if(c[0]==c[1]){error(id,"DUPLICATE_AXIS");return;}
    sequenceActive=false;moving=false;jogJoint=-1;jogDir=0;jogVelocity=jogAcceleration=0;
    for(int k=0;k<2;k++){
      if(!dualActive||dualCh[k]!=c[k])dualVelocity[k]=dualAcceleration[k]=0;
      if(d[k]==0 && dualDir[k]!=0){dualBrakeStart[k]=millis();dualBrakePos[k]=pos[c[k]];}
      dualCh[k]=c[k];dualDir[k]=d[k];dualSpeed[k]=v[k];
    }
    dualActive=true;dualLast=lastAlive=millis();ack(id);return;
  }
  if(!strcmp(op,"SEQBEGIN")){
    int n,rate,blend;
    if(sscanf(args,"%d %d %d %c",&n,&rate,&blend,&extra)!=3||n<1||n>MAX_POINTS||rate<250||rate>4000||(blend!=0&&blend!=1)){error(id,"BAD_SEQUENCE");return;}
    haltMotion();pathCount=n;pathUploaded=0;pendingFingerOverride=false;pathRate=rate;pathBlend=blend;lastAlive=millis();ack(id);return;
  }
  if(!strcmp(op,"SEQADD")){
    int v[6],action=0,target=1500;unsigned long ms,hold,settle=0;
    int fields=sscanf(args,"%d %d %d %d %d %d %lu %lu %d %d %lu %c",&v[0],&v[1],&v[2],&v[3],&v[4],&v[5],&ms,&hold,&action,&target,&settle,&extra);
    if((fields!=8&&fields!=11)||pathCount<1||pathUploaded>=pathCount||sequenceActive||ms<200||ms>120000||hold>120000||action<0||action>4||settle>2000){error(id,"BAD_POINT");return;}
    if(fields==8)target=v[5];
    if(target<MIN_US[5]||target>MAX_US[5]){error(id,"BAD_GRIP_POINT");return;}
    for(int c=0;c<6;c++)if(v[c]<MIN_US[c]||v[c]>MAX_US[c]){error(id,"BAD_POINT");return;}
    int i=++pathUploaded;for(int c=0;c<6;c++)path[i].p[c]=v[c];path[i].ms=ms;path[i].hold=hold;
    path[i].finger=action;path[i].fingerUs=target;path[i].settle=settle;
    lastAlive=millis();ack(id);return;
  }
  if(!strcmp(op,"SEQRUN")){
    if(sscanf(args," %c",&extra)==1||pathCount<1||pathUploaded!=pathCount){error(id,"INCOMPLETE_SEQUENCE");return;}
    for(int c=0;c<6;c++)if(!armed[c]){error(id,"ARM_ALL");return;}
    haltMotion();if(!planSequence()){error(id,"PATH_TOO_SLOW");return;}
    sequenceSkipFingers=pendingFingerOverride;pendingFingerOverride=false;sequenceActive=moving=true;pathIndex=1;pathActionDone=false;moveStart=lastAlive=millis();moveId=id;pathUploaded=0;
    unsigned long total=0;for(int i=1;i<=pathCount;i++)total+=path[i].ms+path[i].hold;
    ack(id);Serial.printf("PLAN %lu %lu\n",id,total);Serial.printf("STEP %lu 0\n",id);return;
  }
  int ch, d, speed;
  if (!strcmp(op, "ARM")) {
    if (sscanf(args, "%d %c", &ch, &extra) != 1 || ch < 0 || ch >= JOINTS) {
      error(id, "BAD_CHANNEL"); return;
    }
    haltMotion();
    if (!initialized[ch]) { error(id, "NEED_INIT"); return; }
    armed[ch] = true; lastAlive = millis(); ack(id); state(); return;
  }
  // Explicit first output. With no position feedback this may move immediately.
  if (!strcmp(op, "INIT")) {
    int pulse;
    if (sscanf(args, "%d %d %c", &ch, &pulse, &extra) != 2 || ch < 0 || ch >= JOINTS ||
        pulse < MIN_US[ch] || pulse > MAX_US[ch]) { error(id, "BAD_INIT"); return; }
    if (initialized[ch]) { error(id, "ALREADY_INITIALIZED"); return; }
    haltMotion(); pos[ch] = pulse;
    if (!writeJoint(ch)) { error(id, "I2C_WRITE"); return; }
    initialized[ch] = true; armed[ch] = true; lastAlive = millis();
    ack(id); state(); return;
  }
  if (!strcmp(op, "JOG")) {
    if (sscanf(args, "%d %d %d %c", &ch, &d, &speed, &extra) != 3 ||
        ch < 0 || ch >= JOINTS || d < -1 || d > 1 || speed < 50 || speed > MAX_JOG_SPEED[ch]) {
      error(id, "BAD_JOG"); return;
    }
    if (!armed[ch]) { error(id, "NOT_ARMED"); return; }
    if (ch == 5 && gripping) { error(id, "RELEASE_GRIP_FIRST"); return; }
    if (d == 0) { if (jogJoint == ch) beginBrake(); lastAlive = millis(); ack(id); return; }
    if (jogJoint != ch) { jogVelocity = 0; jogAcceleration = 0; }
    jogBraking = false;
    sequenceActive=false;dualActive=false;moving = false; jogJoint = ch; jogDir = d; jogSpeed = speed;
    lastJog = lastAlive = millis(); ack(id); return;
  }
  if (!strcmp(op, "MOVE")) {
    int target[JOINTS];
    unsigned long duration;
    int rate = 1000; // 1000 = 1x. Optional for legacy commands.
    int fields = sscanf(args, "%d %d %d %d %d %d %lu %d %c", &target[0], &target[1], &target[2], &target[3], &target[4], &target[5], &duration, &rate, &extra);
    bool legacy = fields == 7 && sscanf(args, "%d %d %d %d %d %d %lu %c", &target[0], &target[1], &target[2], &target[3], &target[4], &target[5], &duration, &extra) == 7;
    if ((!legacy && fields != 8) || duration < 200 || duration > 120000 || rate < 250 || rate > 4000) {
      error(id, "BAD_MOVE"); return;
    }
    for (int ch = 0; ch < JOINTS; ch++) {
      if (target[ch] < MIN_US[ch] || target[ch] > MAX_US[ch]) { error(id, "BAD_MOVE"); return; }
      if (!armed[ch]) { error(id, "ARM_ALL"); return; }
    }
    planMove(target, duration, rate, id); return;
  }
  error(id, "UNKNOWN_COMMAND");
}

void setup() {
  Serial.begin(115200);
  calibration.begin("ras-limits",false);
  for(int ch=0;ch<5;ch++){
    char key[8];snprintf(key,sizeof(key),"lim%d",ch);
    unsigned int packed=calibration.getUInt(key,0);
    int lo=packed>>16,hi=packed&65535;
    if(lo>=500 && hi<=2500 && lo<hi && lo<=ACTIVATE_US[ch] && hi>=ACTIVATE_US[ch]){
      MIN_US[ch]=lo;MAX_US[ch]=hi;
      if(pos[ch]<lo || pos[ch]>hi)pos[ch]=ACTIVATE_US[ch];
    }
  }
  Wire.begin(8, 9);
  Wire.setTimeOut(30);
  ready = pwm.begin();
  if (ready) {
    for (int ch = 0; ch < 16; ch++) pwm.setPWM(ch, 0, 4096);
    pwm.setPWMFreq(50); delay(10);
  }
  lastStep = lastAlive = millis();
}

void loop() {
  // Bounded work so serial traffic cannot starve the motion watchdog.
  for (int n = 0; n < 128 && Serial.available(); n++) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (used && !overflow) { line[used] = 0; handle(line); }
      used = 0; overflow = false;
    } else if (!overflow) {
      if (used < sizeof(line) - 1) line[used++] = c;
      else overflow = true;
    }
  }
  unsigned long now = millis();
  if (anyArmed() && now - lastAlive > WATCHDOG_MS) {
    haltMotion(); cancelGrip(); disarmAll(); releaseIdleOutputs(true);
    Serial.println("FAULT TIMEOUT");
  }
  // Separate jog timeout: a PING alone must not maintain manual motion.
  if (jogDir && now - lastJog > 350) { haltMotion(); }
  if(dualActive && now-dualLast>350)haltMotion();
  if (now - lastStep >= 20) {
    float dt = fminf((now - lastStep) / 1000.0f, 0.05f);
    lastStep = now;
    // Independent grip controller: runs alongside JOG and MOVE on channels 0..4.
    if (ready && gripping && !gripHolding) {
      float t = fminf((now-gripMoveStart)/(float)gripMoveDuration,1.0f);
      pos[5] = gripStartPos + (gripTarget-gripStartPos)*smoothPosition(t);
      if (!writeJoint(5)) return;
      if (t >= 1.0f) {
        pos[5] = gripTarget; gripHolding = true;
        Serial.println("INFO GRIP_HOLDING");
      }
    }
    if(ready && sequenceActive){
      while(sequenceActive){
        unsigned long elapsed=now-moveStart;
        if(elapsed>=path[pathIndex].ms&&!pathActionDone){
          pathActionDone=true;if(!applyFingerAction(pathIndex))return;
        }
        if(elapsed<path[pathIndex].ms+path[pathIndex].hold)break;
        for(int c=0;c<6;c++)if(!(c==5&&(gripping||sequenceSkipFingers||pathManagedFingers)))pos[c]=path[pathIndex].p[c];
        for(int c=0;c<6;c++)if(!(c==5&&(gripping||sequenceSkipFingers||pathManagedFingers))){if(!writeJoint(c))return;}
        moveStart+=path[pathIndex].ms+path[pathIndex].hold;
        if(pathIndex>=pathCount){sequenceActive=moving=false;Serial.printf("DONE %lu\n",moveId);state();break;}
        pathIndex++;pathActionDone=false;Serial.printf("STEP %lu %d\n",moveId,pathIndex-1);
      }
      if(sequenceActive){
        float t=fminf((now-moveStart)/(float)path[pathIndex].ms,1.0f);
        for(int c=0;c<6;c++){
          if(c==5&&(gripping||sequenceSkipFingers||pathManagedFingers))continue;
          float b[6];pathControls(pathIndex,c,b);pos[c]=fmaxf(MIN_US[c],fminf(MAX_US[c],bezier(b,5,t)));
          if(!writeJoint(c))break;
        }
      }
    }else if(ready && dualActive){
      bool stopped=true;
      for(int k=0;k<2;k++){
        int ch=dualCh[k];if(ch<0||!armed[ch]||(ch==5&&gripping))continue;
        if(!dualDir[k]&&fabsf(dualVelocity[k])<1&&fabsf(dualAcceleration[k])<10)continue;
        float target=dualDir[k]*dualSpeed[k];
        float jerk=VELOCITY_RESPONSE*VELOCITY_RESPONSE*(target-dualVelocity[k])-2*VELOCITY_RESPONSE*dualAcceleration[k];
        jerk=fmaxf(-MAX_JERK[ch],fminf(MAX_JERK[ch],jerk));
        dualAcceleration[k]=fmaxf(-MAX_ACCEL[ch],fminf(MAX_ACCEL[ch],dualAcceleration[k]+jerk*dt));
        float old=dualVelocity[k];dualVelocity[k]=fmaxf(-MAX_JOG_SPEED[ch],fminf(MAX_JOG_SPEED[ch],dualVelocity[k]+dualAcceleration[k]*dt));
        if(!dualDir[k] && old*dualVelocity[k]<0)dualVelocity[k]=dualAcceleration[k]=0;
        pos[ch]=fmaxf(MIN_US[ch],fminf(MAX_US[ch],pos[ch]+dualVelocity[k]*dt));
        if((pos[ch]<=MIN_US[ch]&&dualVelocity[k]<0)||(pos[ch]>=MAX_US[ch]&&dualVelocity[k]>0))dualVelocity[k]=dualAcceleration[k]=0;
        if(!dualDir[k]){
          pos[ch]=fmaxf(dualBrakePos[k]-BRAKE_MAX_TRAVEL[ch],fminf(dualBrakePos[k]+BRAKE_MAX_TRAVEL[ch],pos[ch]));
          if(now-dualBrakeStart[k]>=BRAKE_MAX_MS||fabsf(pos[ch]-dualBrakePos[k])>=BRAKE_MAX_TRAVEL[ch])dualVelocity[k]=dualAcceleration[k]=0;
        }
        if(!writeJoint(ch))break;
        if(dualDir[k]||fabsf(dualVelocity[k])>1||fabsf(dualAcceleration[k])>10)stopped=false;
      }
      if(stopped)dualActive=false;
    }else if (ready && moving) {

      float t = fminf((now - moveStart) / (float)moveDuration, 1.0f);
      float smooth = smoothPosition(t);
      for (int ch = 0; ch < JOINTS; ch++) {
        if (ch == 5 && gripping) continue;
        pos[ch] = startPos[ch] + (endPos[ch] - startPos[ch]) * smooth;
        if (idleReleaseJoint(ch) && startPos[ch] == endPos[ch]) { continue; }
        if (!writeJoint(ch)) break;
      }
      if (moving && t >= 1.0f) {
        moving = false; Serial.printf("DONE %lu\n", moveId); state();
      }
    } else if (ready && jogJoint >= 0 && armed[jogJoint]) {
      int ch = jogJoint;
      float desired = jogDir * jogSpeed;
      // Critically damped velocity response with explicit acceleration/jerk bounds.
      float jerk = VELOCITY_RESPONSE*VELOCITY_RESPONSE*(desired-jogVelocity)
                   - 2.0f*VELOCITY_RESPONSE*jogAcceleration;
      jerk = fmaxf(-MAX_JERK[ch],fminf(MAX_JERK[ch],jerk));
      jogAcceleration = fmaxf(-MAX_ACCEL[ch],fminf(MAX_ACCEL[ch],jogAcceleration+jerk*dt));
      float previousVelocity = jogVelocity;
      jogVelocity = fmaxf(-MAX_JOG_SPEED[ch],fminf(MAX_JOG_SPEED[ch],jogVelocity+jogAcceleration*dt));
      if (jogBraking && previousVelocity*jogVelocity < 0) { jogVelocity = 0; jogAcceleration = 0; }
      float next = pos[ch] + jogVelocity * dt;
      if (jogBraking) next = fmaxf(brakeStartPos-BRAKE_MAX_TRAVEL[ch],fminf(brakeStartPos+BRAKE_MAX_TRAVEL[ch],next));
      pos[ch] = fmaxf(MIN_US[ch],fminf(MAX_US[ch],next));
      if (!writeJoint(ch)) return;
      bool atBound = (pos[ch] <= MIN_US[ch] && jogVelocity < 0) || (pos[ch] >= MAX_US[ch] && jogVelocity > 0);
      bool brakeDone = jogBraking && ((fabsf(jogVelocity)<1.0f && fabsf(jogAcceleration)<10.0f)
          || now-brakeStarted >= BRAKE_MAX_MS || fabsf(pos[ch]-brakeStartPos)>=BRAKE_MAX_TRAVEL[ch]);
      if (atBound || brakeDone) haltMotion();
    }
  }
  releaseIdleOutputs();
  if (now - lastReport >= 100) { lastReport = now; state(); }
}

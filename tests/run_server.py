"""Loopback-only UI test service; never opens a physical serial port."""
import sys,tempfile
from pathlib import Path
from aiohttp import web
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import create_app
with tempfile.TemporaryDirectory(prefix='robot-studio-test-') as folder:
    app=create_app(Path(folder)/'robot.db',token='local-ui-test',simulated=True)
    app['studio'].phone.address_provider=lambda:['127.0.0.1']
    web.run_app(app,host='127.0.0.1',port=8876,print=None)

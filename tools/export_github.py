"""Export software, documentation and a self-authored schematic preview only."""
import argparse, base64, json, math, shutil, struct
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def schematic(model):
    meshes = []
    # Six rectangular faces; generated here, never copied from original mesh data.
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    for item in model['meshes']:
        lo, hi = item['bounds']
        vertices = [(lo[0] if i & 4 == 0 else hi[0], lo[1] if i & 2 == 0 else hi[1], lo[2] if i & 1 == 0 else hi[2]) for i in range(8)]
        positions, normals = [], []
        for face in faces:
            for indexes in [(face[0], face[1], face[2]), (face[0], face[2], face[3])]:
                tri = [vertices[i] for i in indexes]
                u = [tri[1][i] - tri[0][i] for i in range(3)]
                v = [tri[2][i] - tri[0][i] for i in range(3)]
                n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
                length = math.sqrt(sum(x*x for x in n)) or 1
                for point in tri:
                    positions.extend(point)
                    normals.extend(round(127*x/length) for x in n)
        meshes.append({**item, 'positions': base64.b64encode(struct.pack('<'+'f'*len(positions), *positions)).decode(), 'normals': base64.b64encode(struct.pack('<'+'b'*len(normals), *normals)).decode(), 'count': len(positions)//3})
    return {**model, 'source': 'Procedural bounding-box preview; original geometry not included', 'meshes': meshes, 'triangles': sum(m['count']//3 for m in meshes)}

def export(destination):
    destination = Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError('Choose a destination outside the running application directory')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Destination must be new or empty')
    shutil.copytree(ROOT, destination, dirs_exist_ok=True, ignore=shutil.ignore_patterns('data', '.venv', '__pycache__', '*.pyc', '*.db', 'stl-meshes.js', '*.stl', '*.step', '*.3mf', 'node_modules', 'test-results'))
    model = json.loads((ROOT/'model/metadata.json').read_text())
    (destination/'preview-model.js').write_text('window.ROBOT_MODEL_KIND="schematic";\nwindow.ROBOT_STL='+json.dumps(schematic(model), separators=(',', ':'))+';\n')
    index = destination/'index.html'
    index.write_text(index.read_text().replace('src="stl-meshes.js?', 'src="preview-model.js?'))
    return destination

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', default=str(ROOT.parent/'GitHub_Ready'))
    args = parser.parse_args()
    print(export(args.destination))

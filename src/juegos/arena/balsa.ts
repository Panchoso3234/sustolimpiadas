import * as THREE from 'three';
import { cielo } from '../decorado';

// La balsa de Sumo de Balsas, compartida por el juego individual y el duelo en vivo: troncos amarrados con una cuerda
// en el borde, espuma alrededor y un mar con olas, boyas, barriles flotando e islas a lo lejos.
// La balsa mide 1 de radio y se escala con `actualizar(R)`; los troncos se encogen con ella.

const madera = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });

export function crearBalsa(escena: THREE.Scene) {
  cielo(escena, '#6cc6ff', '#d9f3ff');
  // Mar: una malla con olas que se mueven (pocos vértices; se calcula en cada cuadro)
  const geoMar = new THREE.PlaneGeometry(90, 90, 44, 44);
  geoMar.rotateX(-Math.PI / 2);
  const mar = new THREE.Mesh(geoMar, new THREE.MeshStandardMaterial({ color: '#2a9fd6', roughness: 0.35, metalness: 0.1, flatShading: true }));
  mar.position.y = -0.45;
  const base = Float32Array.from(geoMar.attributes.position.array as Float32Array);

  // La balsa: troncos paralelos que llenan el círculo, dos vigas debajo y una cuerda en el borde
  const balsa = new THREE.Group(), N = 11, tonos = [madera('#b98548'), madera('#a8743c'), madera('#c99556')];
  for (let i = 0; i < N; i++) {
    const z = -1 + (i + 0.5) * (2 / N), largo = 2 * Math.sqrt(Math.max(0.02, 1 - z * z));
    const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, largo, 8), tonos[i % 3]);
    tronco.rotation.z = Math.PI / 2;
    tronco.position.set(0, -0.12, z);
    balsa.add(tronco);
    // Los extremos de cada tronco, más claros (el corte de la madera)
    for (const lado of [-1, 1]) { const corte = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8), madera('#e3c28a')); corte.rotation.y = lado * Math.PI / 2; corte.position.set((lado * largo) / 2 + lado * 0.001, -0.12, z); balsa.add(corte); }
  }
  for (const x of [-0.45, 0.45]) { const viga = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 1.8), madera('#6b4423')); viga.position.set(x, -0.25, 0); balsa.add(viga); }
  const cuerda = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 48), madera('#d8c08a'));
  cuerda.rotation.x = Math.PI / 2; cuerda.position.y = -0.05;
  balsa.add(cuerda);
  const espuma = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.12, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
  espuma.rotation.x = -Math.PI / 2; espuma.position.y = -0.3;

  // Alrededor: boyas salvavidas, barriles e islitas con palmeras
  const flotan: { o: THREE.Object3D; fase: number }[] = [];
  const boya = () => {
    const g = new THREE.Group(), anillo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.18, 8, 20), madera('#ef4b4b'));
    anillo.rotation.x = Math.PI / 2; g.add(anillo);
    for (let i = 0; i < 4; i++) { const banda = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.38, 0.4), madera('#ffffff')); const a = (i / 4) * Math.PI * 2 + 0.4; banda.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); banda.rotation.y = -a; g.add(banda); }
    return g;
  };
  const barril = () => {
    const g = new THREE.Group(), cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1, 12), madera('#9a6332'));
    g.add(cuerpo);
    for (const y of [-0.3, 0.3]) { const aro = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 6, 16), madera('#4a4a55')); aro.rotation.x = Math.PI / 2; aro.position.y = y; g.add(aro); }
    g.rotation.z = Math.PI / 2;
    return g;
  };
  const decorado = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3, d = 12.5 + (i % 3) * 2.2, o = i % 2 ? boya() : barril();
    o.position.set(Math.cos(a) * d, -0.35, Math.sin(a) * d);
    decorado.add(o); flotan.push({ o, fase: i * 1.7 });
  }
  for (const [x, z, s] of [[-24, -20, 1.4], [26, -16, 1], [-28, 10, 0.9], [22, 22, 1.2]] as const) {
    const isla = new THREE.Group(), arena = new THREE.Mesh(new THREE.CylinderGeometry(3 * s, 3.6 * s, 0.6, 14), madera('#f2deae')), tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 3.2 * s, 6), madera('#8a5a38'));
    tronco.position.set(0.4, 1.6 * s, 0); tronco.rotation.z = -0.2; isla.add(arena, tronco);
    for (let k = 0; k < 5; k++) { const hoja = new THREE.Mesh(new THREE.ConeGeometry(0.35 * s, 2 * s, 4), madera('#3fae4a')); const a = (k / 5) * Math.PI * 2; hoja.position.set(0.75 + Math.cos(a) * 0.8 * s, 3.1 * s, Math.sin(a) * 0.8 * s); hoja.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); isla.add(hoja); }
    isla.position.set(x, -0.3, z);
    decorado.add(isla);
  }
  escena.add(mar, balsa, espuma, decorado);

  return {
    /** Mueve las olas y deja la balsa del radio `R`. */
    actualizar(R: number, t: number) {
      balsa.scale.set(R, 1, R); espuma.scale.set(R, R, 1);
      (espuma.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 3) * 0.12;
      balsa.position.y = Math.sin(t * 1.3) * 0.03; balsa.rotation.z = Math.sin(t * 0.9) * 0.008;
      const pos = geoMar.attributes.position.array as Float32Array;
      for (let i = 0; i < pos.length; i += 3) { const x = base[i], z = base[i + 2]; pos[i + 1] = Math.sin(x * 0.45 + t * 1.3) * 0.16 + Math.cos(z * 0.38 + t * 0.9) * 0.12; }
      geoMar.attributes.position.needsUpdate = true;
      geoMar.computeVertexNormals();
      for (const f of flotan) { f.o.position.y = -0.3 + Math.sin(t * 1.4 + f.fase) * 0.12; f.o.rotation.y = Math.sin(t * 0.5 + f.fase) * 0.4; }
    },
  };
}

/**
 * Browser-side GLB pair renderer for the model demo — bundled at generator
 * runtime by esbuild (see modelRender in generate-demo.spec.ts) and imported
 * into the app page via Vite's /@fs URL, so `three` stays a devDependency
 * that never touches the app bundle.
 *
 * Both files render through the IDENTICAL camera, environment and canvas —
 * the camera is framed from the BEFORE model's bounding box and reused for
 * the after render, so a Draco-quantized bbox can't shift the framing and
 * fake a difference the slider would then show.
 */
import {
	ACESFilmicToneMapping,
	Box3,
	PerspectiveCamera,
	PMREMGenerator,
	Scene,
	SRGBColorSpace,
	Vector3,
	WebGLRenderer
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export async function renderGlbPair(
	beforeUrl: string,
	afterUrl: string,
	width: number,
	height: number,
	dracoPath: string
): Promise<{ before: string; after: string }> {
	const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
	renderer.setSize(width, height);
	renderer.setPixelRatio(1);
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.outputColorSpace = SRGBColorSpace;

	const pmrem = new PMREMGenerator(renderer);
	const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

	const draco = new DRACOLoader();
	draco.setDecoderPath(dracoPath);
	const loader = new GLTFLoader();
	loader.setDRACOLoader(draco);

	const camera = new PerspectiveCamera(35, width / height, 0.01, 1000);
	let framed = false;

	const renderOne = async (url: string) => {
		const gltf = await loader.loadAsync(url);
		const scene = new Scene();
		scene.environment = environment;
		scene.add(gltf.scene);
		if (!framed) {
			// Frame once, from the BEFORE model — both sides must share it.
			const box = new Box3().setFromObject(gltf.scene);
			const center = box.getCenter(new Vector3());
			const diagonal = box.getSize(new Vector3()).length();
			camera.position
				.copy(center)
				.add(new Vector3(diagonal * 0.62, diagonal * 0.38, diagonal * 0.72));
			camera.lookAt(center);
			camera.updateProjectionMatrix();
			framed = true;
		}
		renderer.render(scene, camera);
		return renderer.domElement.toDataURL('image/png');
	};

	try {
		const before = await renderOne(beforeUrl);
		const after = await renderOne(afterUrl);
		return { before, after };
	} finally {
		draco.dispose();
		pmrem.dispose();
		renderer.dispose();
	}
}

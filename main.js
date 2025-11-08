import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Глобальные переменные
let scene, camera, renderer, controls, composer;
let blackHole, accretionDisk, stars;
let settings = {
    diskSpeed: 1.0,
    glowIntensity: 1.0,
    starCount: 5000,
    autoRotate: true,
    showDisk: true
};

// Инициализация сцены
function init() {
    // Создание сцены
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.00025);

    // Настройка камеры
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        10000
    );
    camera.position.set(0, 50, 150);

    // Создание рендерера
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Настройка контроллеров камеры
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 30;
    controls.maxDistance = 500;
    controls.autoRotate = settings.autoRotate;
    controls.autoRotateSpeed = 0.5;

    // Пост-обработка (bloom эффект)
    setupPostProcessing();

    // Создание элементов сцены
    createStarfield();
    createBlackHole();
    createAccretionDisk();
    createLighting();

    // Обработчики событий
    setupEventListeners();

    // Скрыть загрузку
    document.getElementById('loading').style.display = 'none';

    // Запуск анимации
    animate();
}

// Настройка пост-обработки
function setupPostProcessing() {
    composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,  // strength
        0.4,  // radius
        0.85  // threshold
    );
    composer.addPass(bloomPass);
}

// Создание звездного поля
function createStarfield() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    for (let i = 0; i < settings.starCount; i++) {
        // Случайное распределение звезд в сферическом пространстве
        const radius = 500 + Math.random() * 2000;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        positions.push(x, y, z);

        // Различные цвета звезд (от голубых до красных)
        const starType = Math.random();
        if (starType < 0.3) {
            colors.push(0.6, 0.8, 1.0); // Голубые
        } else if (starType < 0.6) {
            colors.push(1.0, 1.0, 1.0); // Белые
        } else if (starType < 0.85) {
            colors.push(1.0, 0.9, 0.7); // Желтые
        } else {
            colors.push(1.0, 0.6, 0.4); // Красные
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });

    stars = new THREE.Points(geometry, material);
    scene.add(stars);
}

// Создание черной дыры
function createBlackHole() {
    const blackHoleGroup = new THREE.Group();

    // Горизонт событий (полностью черная сфера)
    const eventHorizonGeometry = new THREE.SphereGeometry(15, 64, 64);
    const eventHorizonMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide
    });
    const eventHorizon = new THREE.Mesh(eventHorizonGeometry, eventHorizonMaterial);
    blackHoleGroup.add(eventHorizon);

    // Фотонная сфера (слабое свечение вокруг)
    const photonSphereGeometry = new THREE.SphereGeometry(16, 64, 64);
    const photonSphereMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            glowColor: { value: new THREE.Color(0x4488ff) }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 glowColor;
            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
                float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                vec3 glow = glowColor * intensity * (0.5 + 0.5 * sin(time * 2.0));
                gl_FragColor = vec4(glow, intensity * 0.3);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide
    });
    const photonSphere = new THREE.Mesh(photonSphereGeometry, photonSphereMaterial);
    blackHoleGroup.add(photonSphere);

    blackHole = blackHoleGroup;
    blackHole.userData.photonSphereMaterial = photonSphereMaterial;
    scene.add(blackHole);
}

// Создание аккреционного диска
function createAccretionDisk() {
    const diskGroup = new THREE.Group();

    // Создаем несколько слоев диска для более реалистичного эффекта
    for (let layer = 0; layer < 3; layer++) {
        const innerRadius = 20 + layer * 5;
        const outerRadius = 80 + layer * 10;
        const segments = 128;

        const geometry = new THREE.RingGeometry(innerRadius, outerRadius, segments, 1);

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                layer: { value: layer },
                innerRadius: { value: innerRadius },
                outerRadius: { value: outerRadius }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                void main() {
                    vUv = uv;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float layer;
                uniform float innerRadius;
                uniform float outerRadius;
                varying vec2 vUv;
                varying vec3 vPosition;

                void main() {
                    float dist = length(vPosition);
                    float normalizedDist = (dist - innerRadius) / (outerRadius - innerRadius);

                    // Спиральные паттерны
                    float angle = atan(vPosition.y, vPosition.x);
                    float spiral = sin(angle * 8.0 + time * 2.0 - dist * 0.1) * 0.5 + 0.5;

                    // Турбулентность
                    float turbulence = sin(dist * 0.5 + time * 3.0) * cos(angle * 3.0 + time) * 0.5 + 0.5;

                    // Градиент цвета (от оранжевого/желтого к красному)
                    vec3 innerColor = vec3(1.0, 0.9, 0.4);  // Ярко-желтый
                    vec3 middleColor = vec3(1.0, 0.5, 0.1); // Оранжевый
                    vec3 outerColor = vec3(0.8, 0.2, 0.1);  // Темно-красный

                    vec3 color = mix(innerColor, middleColor, normalizedDist * 0.5);
                    color = mix(color, outerColor, normalizedDist * normalizedDist);

                    // Применение паттернов
                    color *= (0.7 + spiral * 0.3) * (0.8 + turbulence * 0.2);

                    // Прозрачность (больше у края)
                    float alpha = (1.0 - normalizedDist * 0.7) * (0.6 + spiral * 0.2) * (1.0 - layer * 0.2);

                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const disk = new THREE.Mesh(geometry, material);
        disk.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.05; // Небольшой наклон
        disk.userData.layer = layer;
        disk.userData.rotationSpeed = 0.001 / (layer + 1);
        diskGroup.add(disk);
    }

    accretionDisk = diskGroup;
    scene.add(accretionDisk);
}

// Создание освещения
function createLighting() {
    // Основное освещение от диска
    const diskLight = new THREE.PointLight(0xff6622, 2, 300);
    diskLight.position.set(0, 0, 0);
    scene.add(diskLight);

    // Заполняющий свет
    const ambientLight = new THREE.AmbientLight(0x111122, 0.3);
    scene.add(ambientLight);

    // Дополнительные точечные источники света
    const light1 = new THREE.PointLight(0x4488ff, 0.5, 200);
    light1.position.set(100, 50, 100);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xff8844, 0.3, 200);
    light2.position.set(-100, -50, -100);
    scene.add(light2);
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Изменение размера окна
    window.addEventListener('resize', onWindowResize, false);

    // Контроллеры
    document.getElementById('disk-speed').addEventListener('input', (e) => {
        settings.diskSpeed = parseFloat(e.target.value);
        document.getElementById('disk-speed-value').textContent = settings.diskSpeed.toFixed(1);
    });

    document.getElementById('glow-intensity').addEventListener('input', (e) => {
        settings.glowIntensity = parseFloat(e.target.value);
        document.getElementById('glow-value').textContent = settings.glowIntensity.toFixed(1);
    });

    document.getElementById('star-count').addEventListener('input', (e) => {
        settings.starCount = parseInt(e.target.value);
        document.getElementById('stars-value').textContent = settings.starCount;
        // Пересоздать звезды
        scene.remove(stars);
        createStarfield();
    });

    document.getElementById('auto-rotate').addEventListener('change', (e) => {
        settings.autoRotate = e.target.checked;
        controls.autoRotate = settings.autoRotate;
    });

    document.getElementById('show-disk').addEventListener('change', (e) => {
        settings.showDisk = e.target.checked;
        accretionDisk.visible = settings.showDisk;
    });
}

// Обработка изменения размера окна
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// Анимация
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now() * 0.001;

    // Обновление фотонной сферы
    if (blackHole && blackHole.userData.photonSphereMaterial) {
        blackHole.userData.photonSphereMaterial.uniforms.time.value = time * settings.glowIntensity;
    }

    // Вращение аккреционного диска
    if (accretionDisk) {
        accretionDisk.children.forEach((disk, index) => {
            disk.rotation.z += disk.userData.rotationSpeed * settings.diskSpeed;
            if (disk.material && disk.material.uniforms) {
                disk.material.uniforms.time.value = time * settings.diskSpeed;
            }
        });
    }

    // Медленное вращение звезд для эффекта глубины
    if (stars) {
        stars.rotation.y += 0.0001;
    }

    // Обновление контроллеров
    controls.update();

    // Рендеринг с пост-обработкой
    composer.render();
}

// Запуск приложения
init();

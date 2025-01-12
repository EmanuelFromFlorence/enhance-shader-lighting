﻿import * as THREE from "three"
import { Capsule } from "three/examples/jsm/math/Capsule"
import { Octree } from "three/examples/jsm/math/Octree"

let height = 3

const position = new THREE.Vector3()
const rotation = new THREE.Euler()

export const playerCollider = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.35)
export const worldOctree = new Octree()

export const playerVelocity = new THREE.Vector3()
export const playerDirection = new THREE.Vector3()

export let lastMoveTime = 0

let playerOnFloor = false
let flyMode = false
let cinematicMode = false

let lastSpacePressTime = 0

let camera
let playerObject

let spawn = [position, rotation]

const GRAVITY = 57.5
let speedMultiplier = 1

export function setMovementCamera(_camera, scene, _height) {
	camera = _camera
	height = _height
	speedMultiplier = height / 3

	playerObject = new THREE.Object3D()
	playerObject.add(camera)
	scene.add(playerObject)
	playerObject.add(camera)

	spawnPlayer()
}

export function setSpawn(_spawn) {
	spawn = _spawn

	spawn[0].y -= height

	spawnPlayer()
}

const keyStates = {}

document.addEventListener("keydown", event => {
	if (document.pointerLockElement !== document.body) return

	keyStates[event.code] = true

	if (event.code === "KeyT") spawnPlayer()
	if (event.code === "KeyC") {
		cinematicMode = !cinematicMode

		if (cinematicMode) {
			camera.cinematicClip.reset().play()
		} else {
			camera.cinematicClip.stop()

			spawnPlayer()
		}
	}

	lastMoveTime = performance.now()
})

document.addEventListener("keyup", event => {
	if (document.pointerLockElement !== document.body) return

	if (event.code === "Space") {
		const now = performance.now()

		if (now - lastSpacePressTime < 300) {
			flyMode = !flyMode
			if (!flyMode) setPosition(playerObject.position.clone().sub(new THREE.Vector3(0, height, 0)))
		}

		lastSpacePressTime = now
	}

	keyStates[event.code] = false
})

document.body.addEventListener("mousemove", event => {
	if (document.pointerLockElement === document.body && !cinematicMode) {
		playerObject.rotation.x -= event.movementY / camera.zoom / 500
		playerObject.rotation.y -= event.movementX / camera.zoom / 500
		lastMoveTime = performance.now()
	}
})

function setPosition(position) {
	camera.rotation.set(0, 0, 0)
	playerVelocity.set(0, 0, 0)

	playerObject.position.copy(position)

	playerCollider.start.copy(position)
	playerCollider.end.copy(position)

	if (!flyMode) playerCollider.end.y += height
}

export function spawnPlayer() {
	setPosition(spawn[0])
	playerObject.rotation.copy(spawn[1])
}

function updatePlayer(deltaTime) {
	if (cinematicMode) {
		camera.rotation.set(-Math.PI / 2, 0, 0)
		playerObject.updateMatrixWorld()

		return
	}

	playerObject.rotation.x = THREE.MathUtils.clamp(playerObject.rotation.x, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05)

	let weight = 0

	if (flyMode) {
		let speed = -(keyStates["ShiftLeft"] ? 0.75 : 0.375)

		if ((keyStates["keyW"] || keyStates["keyS"]) && (keyStates["keyA"] || keyStates["keyD"])) {
			speed *= 0.5 ** 0.5
		}
		if (
			(keyStates["keyW"] || keyStates["keyS"] || keyStates["keyA"] || keyStates["keyD"]) &&
			(keyStates["keyA"] || keyStates["keyD"])
		) {
			speed *= 0.5 ** 0.5
		}

		camera.getWorldDirection(playerDirection).multiplyScalar(speed)

		if (keyStates["KeyS"]) {
			playerObject.position.add(playerDirection)
		} else if (keyStates["KeyW"]) {
			playerObject.position.sub(playerDirection)
		}

		getSideVector().multiplyScalar(speed)

		if (keyStates["KeyD"]) {
			playerObject.position.add(playerDirection)
		} else if (keyStates["KeyA"]) {
			playerObject.position.sub(playerDirection)
		}

		playerObject.rotation.x += Math.PI / 2
		camera.getWorldDirection(playerDirection).multiplyScalar(speed)
		playerObject.rotation.x -= Math.PI / 2

		if (keyStates["KeyQ"]) {
			playerObject.position.add(playerDirection)
		} else if (keyStates["KeyE"]) {
			playerObject.position.sub(playerDirection)
		}
	} else {
		let damping = Math.exp(-15 * deltaTime) - 1

		if (!playerOnFloor) {
			playerVelocity.y -= GRAVITY * deltaTime

			// small air resistance
			damping *= 0.1

			if (playerObject.position.y < -10) {
				spawnPlayer()
			}
		}

		playerVelocity.addScaledVector(playerVelocity, damping)

		const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime)
		playerCollider.translate(deltaPosition)

		playerCollisions()

		playerObject.position.copy(playerCollider.end)

		weight = Math.hypot(playerVelocity.x, playerVelocity.z)
		weight *= 0.00225 / speedMultiplier
		if (weight > 0.1) weight = 0.1
	}

	// const weightDelta = Math.max((flyMode ? 0.75 : 15) * deltaTime, 1);

	camera.clip.weight = 1
	camera.clip.timeScale = 1

	playerObject.updateMatrixWorld()
}

function playerCollisions() {
	const result = worldOctree.capsuleIntersect(playerCollider)

	playerOnFloor = false

	if (result) {
		playerOnFloor = result.normal.y > 0

		if (!playerOnFloor) {
			playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity))
		}

		playerCollider.translate(result.normal.multiplyScalar(result.depth))
	}
}

function getForwardVector() {
	playerObject.getWorldDirection(playerDirection)
	playerDirection.y = 0
	playerDirection.normalize()

	return playerDirection
}

function getSideVector() {
	playerObject.getWorldDirection(playerDirection)
	playerDirection.y = 0
	playerDirection.normalize()
	playerDirection.cross(playerObject.up)

	return playerDirection
}

export function controls(deltaTime) {
	const speed = -(playerOnFloor ? 3.75 : 1) * GRAVITY * speedMultiplier

	// gives a bit of air control
	let speedDelta = deltaTime * speed
	if (keyStates["ShiftLeft"]) speedDelta *= 1.75

	if (keyStates["KeyW"]) {
		playerVelocity.add(getForwardVector().multiplyScalar(speedDelta))
	}

	if (keyStates["KeyS"]) {
		playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta))
	}

	if (keyStates["KeyA"]) {
		playerVelocity.add(getSideVector().multiplyScalar(-speedDelta))
	}

	if (keyStates["KeyD"]) {
		playerVelocity.add(getSideVector().multiplyScalar(speedDelta))
	}

	if (playerOnFloor) {
		if (keyStates["Space"]) {
			playerVelocity.y = 0.5 * GRAVITY * speedMultiplier
		}
	}

	updatePlayer(deltaTime)
}

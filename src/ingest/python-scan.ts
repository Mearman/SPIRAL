// Python feature scanning — determines minimum IR layer

import type { Layer } from "./types.ts";
import type { PyNode } from "./python-types.ts";
import { isAstNode, isCall, isPrintCall } from "./python-types.ts";

const LAYER_ORDER: Record<Layer, number> = { air: 0, cir: 1, eir: 2 };

function maxLayer(a: Layer, b: Layer): Layer {
	return LAYER_ORDER[a] >= LAYER_ORDER[b] ? a : b;
}

function classifyNode(node: PyNode, layer: Layer): Layer {
	switch (node._type) {
	case "While":
	case "For":
		return maxLayer(layer, "eir");
	case "Call":
		if (isCall(node) && isPrintCall(node)) return maxLayer(layer, "eir");
		return layer !== "eir" ? maxLayer(layer, "cir") : layer;
	case "FunctionDef":
	case "Lambda":
		return maxLayer(layer, "cir");
	default:
		return layer;
	}
}

function visitChildren(node: PyNode, visit: (n: PyNode) => void): void {
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				if (isAstNode(item)) visit(item);
			}
		} else if (isAstNode(value)) {
			visit(value);
		}
	}
}

export function scanPythonFeatures(body: PyNode[]): Layer {
	let layer: Layer = "air";

	function visit(node: PyNode): void {
		layer = classifyNode(node, layer);
		visitChildren(node, visit);
	}

	for (const stmt of body) {
		visit(stmt);
	}
	return layer;
}

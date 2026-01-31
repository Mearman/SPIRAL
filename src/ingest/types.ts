// Internal types shared across ingest sub-modules

export type Layer = "air" | "cir" | "eir" | "pir";

export interface IngestNode {
	id: string;
	expr: unknown;
}

export interface IngestState {
	nodes: IngestNode[];
	nextSynthId: number;
	usedIds: Set<string>;
	layer: Layer;
	currentFunctionName: string | null;
	floatNumbers: boolean;
}

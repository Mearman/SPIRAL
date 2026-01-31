# SPIRAL Cross-Implementation Compliance Tests (Python)
# Tests that Python and TypeScript implementations produce identical results

"""
Cross-implementation compliance test suite for SPIRAL.

This module loads the same JSON fixtures used by the TypeScript implementation
and verifies that the Python implementation produces identical results.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from pyspiral.evaluator import evaluate_air_cir, evaluate_eir
from pyspiral.lir.evaluator import evaluate_lir
from pyspiral.lir.async_evaluator import evaluate_lir_async
from pyspiral.env import empty_defs
from pyspiral.effects import empty_effect_registry
from pyspiral.domains.registry import empty_registry


#==============================================================================
# Test Fixture Definition
#==============================================================================

@dataclass(frozen=True)
class ExpectedOutput:
    """Expected output - normalized form that works across implementations."""
    value: Any
    structural: bool
    tolerance: float = 0
    error: dict[str, Any] | None = None


@dataclass(frozen=True)
class FixtureMetadata:
    """Fixture metadata."""
    layer: Literal["AIR", "CIR", "EIR", "LIR"]
    category: str
    description: str


@dataclass(frozen=True)
class ComplianceFixture:
    """A test fixture for cross-implementation compliance."""
    id: str
    document_path: str
    inputs_path: str | None = None
    expected: ExpectedOutput | None = None
    metadata: FixtureMetadata | None = None


#==============================================================================
# Value Comparison Utilities
#==============================================================================

def deep_equal(actual: Any, expected: Any, tolerance: float = 0) -> bool:
    """
    Deep compare two values for structural equality.
    Handles floating-point tolerance and set ordering.
    """
    # Handle null/None
    if actual is None:
        return actual == expected
    if expected is None:
        return False

    # Primitive values
    if not isinstance(actual, dict) or not isinstance(expected, dict):
        return actual == expected

    actual_obj = actual
    expected_obj = expected

    # Compare by kind
    if "kind" in actual_obj and "kind" in expected_obj:
        if actual_obj["kind"] != expected_obj["kind"]:
            return False

    kind = actual_obj.get("kind")

    match kind:
        case "int" | "bool" | "string":
            return actual_obj.get("value") == expected_obj.get("value")

        case "float":
            actual_value = actual_obj.get("value", 0) if isinstance(actual_obj.get("value"), (int, float)) else 0
            expected_value = expected_obj.get("value", 0) if isinstance(expected_obj.get("value"), (int, float)) else 0
            if tolerance > 0:
                return abs(actual_value - expected_value) <= tolerance
            return actual_value == expected_value

        case "list":
            actual_list = actual_obj.get("value", [])
            expected_list = expected_obj.get("value", [])
            if not isinstance(actual_list, list) or not isinstance(expected_list, list):
                return False
            if len(actual_list) != len(expected_list):
                return False
            return all(
                deep_equal(actual_list[i], expected_list[i], tolerance)
                for i in range(len(actual_list))
            )

        case "set":
            actual_list = actual_obj.get("value", [])
            expected_list = expected_obj.get("value", [])
            if not isinstance(actual_list, list) or not isinstance(expected_list, list):
                return False
            if len(actual_list) != len(expected_list):
                return False
            # Sets are unordered - compare as sets
            actual_items = {json.dumps(item, sort_keys=True) for item in actual_list}
            expected_items = {json.dumps(item, sort_keys=True) for item in expected_list}
            return expected_items.issubset(actual_items)

        case "void":
            return kind == expected_obj.get("kind")

        case "error":
            return actual_obj.get("code") == expected_obj.get("code")

        case _:
            # For unknown types, fall back to JSON comparison
            return json.dumps(actual, sort_keys=True) == json.dumps(expected, sort_keys=True)


def normalize_value(value: Any) -> Any:
    """
    Normalize a value for cross-implementation comparison.
    Removes implementation-specific artifacts (e.g., closure IDs, task IDs).
    """
    if not isinstance(value, dict) or value is None:
        return value

    # Remove closure function IDs (implementation-specific)
    if value.get("kind") == "closure":
        return {
            "kind": "closure",
            "params": value.get("params"),
            "body": value.get("body"),
            "env": "<env>",  # Don't compare env contents
        }

    # Remove task IDs from futures (implementation-specific)
    if value.get("kind") == "future":
        return {
            "kind": "future",
            "of": normalize_value(value.get("of")),
            "status": value.get("status"),
        }

    # Recursively normalize nested values
    if "value" in value and isinstance(value["value"], object):
        if isinstance(value["value"], list):
            return {
                "kind": value.get("kind"),
                "value": [normalize_value(v) for v in value["value"]],
            }
        if value["value"] is not None:
            normalized = {}
            for key, val in value["value"].items():
                normalized[key] = normalize_value(val)
            return {
                "kind": value.get("kind"),
                "value": normalized,
            }

    return value


#==============================================================================
# Fixture Registry
#==============================================================================

# Shared fixture registry - must match TypeScript implementation
COMPLIANCE_FIXTURES: list[ComplianceFixture] = [
    #==========================================================================
    # AIR Fixtures - Primitive Recursive, Always Terminates
    #==========================================================================

    ComplianceFixture(
        id="air-arithmetic-add",
        document_path="examples/air/basics/arithmetic/arithmetic.air.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 42},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="AIR",
            category="basics",
            description="Arithmetic operations (add, sub, mul, div)",
        ),
    ),

    ComplianceFixture(
        id="air-comparisons-lt",
        document_path="examples/air/basics/comparisons/comparisons.air.json",
        expected=ExpectedOutput(
            value={"kind": "bool", "value": True},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="AIR",
            category="basics",
            description="Comparison operations (eq, lt, gt, le, ge)",
        ),
    ),

    ComplianceFixture(
        id="air-boolean-logic",
        document_path="examples/air/basics/boolean-logic/boolean-logic.air.json",
        expected=ExpectedOutput(
            value={"kind": "bool", "value": True},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="AIR",
            category="basics",
            description="Boolean operations (and, or, not)",
        ),
    ),

    ComplianceFixture(
        id="air-list-length",
        document_path="examples/air/data-structures/list-length/list-length.air.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 3},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="AIR",
            category="data-structures",
            description="List length operation",
        ),
    ),

    ComplianceFixture(
        id="air-list-nth",
        document_path="examples/air/data-structures/list-nth/list-nth.air.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 2},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="AIR",
            category="data-structures",
            description="List nth element access",
        ),
    ),

    ComplianceFixture(
        id="air-list-concat",
        document_path="examples/air/data-structures/list-concat/list-concat.air.json",
        expected=ExpectedOutput(
            value={
                "kind": "list",
                "of": {"kind": "int"},
                "value": [
                    {"kind": "int", "value": 1},
                    {"kind": "int", "value": 2},
                    {"kind": "int", "value": 3},
                    {"kind": "int", "value": 4},
                ],
            },
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="AIR",
            category="data-structures",
            description="List concatenation",
        ),
    ),

    ComplianceFixture(
        id="air-simple-if",
        document_path="examples/air/control-flow/simple-if/simple-if.air.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 10},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="AIR",
            category="control-flow",
            description="Simple conditional expression",
        ),
    ),

    #==========================================================================
    # CIR Fixtures - Turing-Complete with Lambdas
    #==========================================================================

    ComplianceFixture(
        id="cir-identity-lambda",
        document_path="examples/cir/basics/identity-lambda/identity-lambda.cir.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 42},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="CIR",
            category="basics",
            description="Identity lambda function",
        ),
    ),

    ComplianceFixture(
        id="cir-closures",
        document_path="examples/cir/basics/closures/closures.cir.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 15},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="CIR",
            category="basics",
            description="Closure capturing environment",
        ),
    ),

    ComplianceFixture(
        id="cir-fix-factorial",
        document_path="examples/cir/fixpoint/fix-factorial/fix-factorial.cir.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 120},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="CIR",
            category="fixpoint",
            description="Factorial via fixpoint combinator",
        ),
    ),

    #==========================================================================
    # EIR Fixtures - Execution with Effects
    #==========================================================================

    ComplianceFixture(
        id="eir-sequencing",
        document_path="examples/eir/basics/sequencing/sequencing.eir.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 10},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="EIR",
            category="basics",
            description="Sequential execution",
        ),
    ),

    ComplianceFixture(
        id="eir-assignment",
        document_path="examples/eir/basics/assignment/assignment.eir.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 5},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="EIR",
            category="basics",
            description="Variable assignment",
        ),
    ),

    ComplianceFixture(
        id="eir-while-loop",
        document_path="examples/eir/loops/while-loop/while-loop.eir.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 10},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="EIR",
            category="loops",
            description="While loop iteration",
        ),
    ),

    #==========================================================================
    # LIR Fixtures - CFG-Based Evaluation
    #==========================================================================

    ComplianceFixture(
        id="lir-straight-line",
        document_path="examples/lir/basics/straight-line/straight-line.lir.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 7},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="LIR",
            category="basics",
            description="Straight-line code execution",
        ),
    ),

    ComplianceFixture(
        id="lir-conditional",
        document_path="examples/lir/basics/conditional/conditional.lir.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 10},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="LIR",
            category="basics",
            description="Conditional branch execution",
        ),
    ),

    ComplianceFixture(
        id="lir-factorial",
        document_path="examples/lir/algorithms/factorial/factorial.lir.json",
        expected=ExpectedOutput(
            value={"kind": "int", "value": 120},
            structural=True,
        ),
        metadata=FixtureMetadata(
            layer="LIR",
            category="algorithms",
            description="Factorial algorithm",
        ),
    ),
]


#==============================================================================
# Fixture Loading Utilities
#==============================================================================

def load_fixture_document(fixture: ComplianceFixture) -> dict[str, Any]:
    """Load a fixture's SPIRAL document."""
    path = Path(fixture.document_path)
    if not path.exists():
        # Try relative to examples directory
        path = Path(__file__).parent.parent.parent / fixture.document_path
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_fixture_inputs(fixture: ComplianceFixture) -> dict[str, Any] | None:
    """Load a fixture's inputs (if provided)."""
    if not fixture.inputs_path:
        return None
    path = Path(fixture.inputs_path)
    if not path.exists():
        # Try relative to examples directory
        path = Path(__file__).parent.parent.parent / fixture.inputs_path
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_fixtures_by_layer(layer: str) -> list[ComplianceFixture]:
    """Get fixtures by layer."""
    return [f for f in COMPLIANCE_FIXTURES if f.metadata and f.metadata.layer == layer]


def get_fixture_by_id(fixture_id: str) -> ComplianceFixture | None:
    """Get fixture by ID."""
    for fixture in COMPLIANCE_FIXTURES:
        if fixture.id == fixture_id:
            return fixture
    return None


#==============================================================================
# Fixture Execution
#==============================================================================

async def execute_fixture(fixture: ComplianceFixture) -> dict[str, Any]:
    """
    Execute a fixture using the Python implementation.
    """
    doc = load_fixture_document(fixture)
    inputs = load_fixture_inputs(fixture)

    layer = fixture.metadata.layer if fixture.metadata else "AIR"
    registry = empty_registry()
    defs = empty_defs()
    effects = empty_effect_registry()

    # Parse inputs if provided
    input_map: dict[str, Any] = {}
    if inputs:
        input_map = inputs

    match layer:
        case "AIR" | "CIR":
            # AIR/CIR uses evaluate_air_cir
            result = evaluate_air_cir(doc, registry, defs, input_map)
            return result

        case "EIR":
            # EIR uses evaluate_eir
            result = evaluate_eir(doc, registry, defs, input_map, effects)
            return result

        case "LIR":
            # Check if this is an async LIR document (has fork terminator)
            is_async = '"kind": "fork"' in json.dumps(doc)
            if is_async:
                result = await evaluate_lir_async(doc, registry, effects, input_map, defs)
                return result
            result = evaluate_lir(doc, registry, effects, input_map, defs)
            return result

        case _:
            raise ValueError(f"Unknown layer: {layer}")


def verify_fixture_result(fixture: ComplianceFixture, result: dict[str, Any]) -> None:
    """
    Verify a fixture's result matches expected output.
    """
    if not fixture.expected:
        return

    expected = fixture.expected

    # Check for error expectation
    if expected.error:
        if result.get("kind") != "error":
            raise AssertionError(f"Expected error with code {expected.error['code']}, got {result.get('kind')}")
        if result.get("code") != expected.error["code"]:
            raise AssertionError(f"Expected error code {expected.error['code']}, got {result.get('code')}")
        return

    # Check value matches expected
    normalized_result = normalize_value(result)
    tolerance = expected.tolerance

    if expected.structural:
        if not deep_equal(normalized_result, expected.value, tolerance):
            raise AssertionError(
                f"Value mismatch:\n"
                f"  Expected: {json.dumps(expected.value, indent=2)}\n"
                f"  Actual:   {json.dumps(normalized_result, indent=2)}"
            )
    else:
        # String comparison
        actual_string = json.dumps(normalized_result)
        expected_string = json.dumps(expected.value)
        if actual_string != expected_string:
            raise AssertionError(
                f"String representation mismatch:\n"
                f"  Expected: {expected_string}\n"
                f"  Actual:   {actual_string}"
            )


#==============================================================================
# Test Runner
#==============================================================================

async def run_all_fixtures() -> dict[str, list[str]]:
    """
    Run all compliance fixtures and return results.

    Returns:
        A dictionary with layer names as keys and lists of failed fixture IDs as values.
    """
    results: dict[str, list[str]] = {
        "AIR": [],
        "CIR": [],
        "EIR": [],
        "LIR": [],
    }

    for fixture in COMPLIANCE_FIXTURES:
        try:
            result = await execute_fixture(fixture)
            verify_fixture_result(fixture, result)
            print(f"✓ [{fixture.metadata.layer if fixture.metadata else '?'}] {fixture.id}")
        except AssertionError as e:
            layer = fixture.metadata.layer if fixture.metadata else "?"
            if layer in results:
                results[layer].append(fixture.id)
            print(f"✗ [{layer}] {fixture.id}: {e}")
        except Exception as e:
            layer = fixture.metadata.layer if fixture.metadata else "?"
            if layer in results:
                results[layer].append(fixture.id)
            print(f"✗ [{layer}] {fixture.id}: {e}")

    return results


def print_summary(results: dict[str, list[str]]) -> None:
    """Print test summary."""
    total = len(COMPLIANCE_FIXTURES)
    failed = sum(len(fails) for fails in results.values())
    passed = total - failed

    print("\n" + "=" * 60)
    print("Cross-Implementation Compliance Test Summary")
    print("=" * 60)
    print(f"Total: {total} fixtures")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")

    for layer, fails in results.items():
        if fails:
            print(f"\n{layer} failures: {len(fails)}")
            for fixture_id in fails:
                print(f"  - {fixture_id}")

    print("=" * 60)


if __name__ == "__main__":
    import asyncio

    results = asyncio.run(run_all_fixtures())
    print_summary(results)

    # Exit with error code if any tests failed
    if any(results.values()):
        exit(1)

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.pipeline.state import STAGES, PipelineState


def build_graph(nodes: dict) -> object:
    """Linear graph: readings → baseline → detection → correlation → events → explanation → recommendation.
    One node per UI stage; no checkpointer (progress is persisted by the runner from the update stream)."""
    g = StateGraph(PipelineState)
    for key in STAGES:
        g.add_node(key, nodes[key])
    g.add_edge(START, STAGES[0])
    for a, b in zip(STAGES, STAGES[1:]):
        g.add_edge(a, b)
    g.add_edge(STAGES[-1], END)
    return g.compile()

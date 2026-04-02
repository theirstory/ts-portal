"""Transcript parsing utilities for building structured spaCy documents."""

from __future__ import annotations

from typing import Any, Dict, List

from spacy.language import Language
from spacy.tokens import Doc, Span, Token

from spacy_models import get_en_sentence_nlp


def _ensure_extensions() -> None:
    if not Doc.has_extension("sections"):
        Doc.set_extension("sections", default=[])

    if not Span.has_extension("paragraphs"):
        Span.set_extension("paragraphs", default=[])
    if not Span.has_extension("timestamp"):
        Span.set_extension("timestamp", default=None)
    if not Span.has_extension("title"):
        Span.set_extension("title", default=None)
    if not Span.has_extension("synopsis"):
        Span.set_extension("synopsis", default=None)
    if not Span.has_extension("speaker"):
        Span.set_extension("speaker", default=None)
    if not Span.has_extension("start_time"):
        Span.set_extension("start_time", default=None)
    if not Span.has_extension("end_time"):
        Span.set_extension("end_time", default=None)

    if not Token.has_extension("start_time"):
        Token.set_extension("start_time", default=None)
    if not Token.has_extension("end_time"):
        Token.set_extension("end_time", default=None)


_ensure_extensions()


@Language.component("from_json")
def from_json(doc: Doc, json_data: Dict[str, Any], **kwargs: Any) -> Doc:
    """Build a single document from section/paragraph/word transcript JSON."""
    annotation_nlp = kwargs.get("nlp")
    if annotation_nlp is None:
        annotation_nlp = get_en_sentence_nlp()

    all_words: List[str] = []
    all_word_data: List[Dict[str, Any]] = []

    for section_idx, section in enumerate(json_data["sections"]):
        for para_idx, paragraph in enumerate(section["paragraphs"]):
            for word_idx, word in enumerate(paragraph["words"]):
                all_words.append(word["text"])
                all_word_data.append(
                    {
                        **word,
                        "section_idx": section_idx,
                        "para_idx": para_idx,
                        "word_idx": word_idx,
                    }
                )

    doc = Doc(doc.vocab, words=all_words)

    for index, token in enumerate(doc):
        word_data = all_word_data[index]
        token._.start_time = word_data["start"]
        token._.end_time = word_data["end"]

    section_spans: List[Span] = []
    current_section_idx = -1
    current_para_idx = -1
    section_start_token = 0
    para_start_token = 0
    current_section_paragraphs: List[Span] = []

    def finalize_paragraph(end_token_idx: int) -> None:
        nonlocal para_start_token, current_section_paragraphs
        if current_para_idx < 0 or end_token_idx <= para_start_token:
            return

        paragraph_span = doc[para_start_token:end_token_idx]
        paragraph_data = json_data["sections"][current_section_idx]["paragraphs"][current_para_idx]
        paragraph_span._.speaker = paragraph_data.get("speaker")
        paragraph_span._.start_time = paragraph_data.get("start")
        paragraph_span._.end_time = paragraph_data.get("end")
        current_section_paragraphs.append(paragraph_span)

    def finalize_section(end_token_idx: int) -> None:
        nonlocal current_section_paragraphs, section_start_token
        if current_section_idx < 0 or end_token_idx <= section_start_token:
            return

        section_span = doc[section_start_token:end_token_idx]
        section_data = json_data["sections"][current_section_idx]
        section_span._.timestamp = section_data.get("timestamp")
        section_span._.title = section_data.get("title")
        section_span._.synopsis = section_data.get("synopsis")
        section_span._.paragraphs = list(current_section_paragraphs)
        section_spans.append(section_span)
        current_section_paragraphs = []

    for index, word_data in enumerate(all_word_data):
        if word_data["section_idx"] != current_section_idx:
            if current_section_idx >= 0:
                finalize_paragraph(index)
                finalize_section(index)

            section_start_token = index
            current_section_idx = word_data["section_idx"]
            current_para_idx = -1

        if word_data["para_idx"] != current_para_idx:
            if current_para_idx >= 0:
                finalize_paragraph(index)

            para_start_token = index
            current_para_idx = word_data["para_idx"]

    if current_section_idx >= 0:
        finalize_paragraph(len(doc))
        finalize_section(len(doc))

    doc._.sections = section_spans

    for _, component in annotation_nlp.pipeline:
        doc = component(doc)

    final_entities: List[Span] = []
    for ent in doc.ents:
        entity_span = Span(doc, ent.start, ent.end, label=ent.label_.replace(" ", "_"))
        entity_span._.start_time = doc[ent.start]._.start_time
        entity_span._.end_time = doc[ent.end - 1]._.end_time
        final_entities.append(entity_span)

    doc.ents = final_entities
    return doc


class TheirStoryTranscriptParser:
    """Parse transcript JSON into a structured spaCy document."""

    def __init__(self) -> None:
        # Keep parser and annotation pipelines separate so custom components
        # do not accidentally run inside the auxiliary pipeline.
        self.parser_nlp = get_en_sentence_nlp()
        self.annotation_nlp = get_en_sentence_nlp()
        self.parser_nlp.add_pipe("from_json")

    def parse_json(self, json_data: Dict[str, Any]) -> Doc:
        empty_doc = Doc(self.parser_nlp.vocab, words=[])
        return self.parser_nlp.get_pipe("from_json")(empty_doc, json_data, nlp=self.annotation_nlp)

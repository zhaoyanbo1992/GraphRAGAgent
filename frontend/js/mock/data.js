// 自动生成：tools/gen_mock.py —— 逐字段拷贝实测产物，禁止手改。
// 来源 snapshot：a00ce40c_sample_report / dd68cea4_sample_graphrag_overview；溯源断言已通过。
export const MOCK = {
  docs: [
 {
  "document_id": "a00ce40c_sample_report",
  "original_filename": "sample_report.pdf",
  "format": "pdf",
  "size_bytes": 2728,
  "page_count": 2,
  "status": "done",
  "n_chunks": 2,
  "n_entities": 10,
  "n_triples": 13,
  "created_at": "2026-10-14T01:59:58Z",
  "indexed_at": "2026-10-14T02:00:45Z",
  "error": null
 },
 {
  "document_id": "dd68cea4_sample_graphrag_overview",
  "original_filename": "sample_graphrag_overview.pdf",
  "format": "pdf",
  "size_bytes": 9214,
  "page_count": 4,
  "status": "done",
  "n_chunks": 14,
  "n_entities": 17,
  "n_triples": 25,
  "created_at": "2026-10-14T02:05:00Z",
  "indexed_at": "2026-10-14T02:05:52Z",
  "error": null
 }
],
  results: {
 "a00ce40c_sample_report": {
  "doc_id": "a00ce40c_sample_report",
  "full_md": "## Quarterly Financial Report (Demo)\n\nThis is a sample report generated for the MinerU MVP pipeline test.\n\nThe purpose is to validate document upload, cloud parsing, and\n\nthe layout information returned by the MinerU extract API.\n\nTotal revenue in Q3 was 12.5 billion CNY, up 18.2% year over year.\n\nGross margin reached 41.6%, while operating expenses were 4.8 billion.\n\n## Quarterly Results (Unit: billion CNY)\n\n<table><tr><td>Quarter</td><td>Revenue</td><td>Net Profit</td><td>Margin</td></tr><tr><td>Q1</td><td>8.3</td><td>0.9</td><td>10.8%</td></tr><tr><td>Q2</td><td>10.1</td><td>1.2</td><td>11.9%</td></tr><tr><td>Q3</td><td>12.5</td><td>1.6</td><td>12.8%</td></tr></table>",
  "chunks": [
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "doc_id": "a00ce40c_sample_report",
    "section_title": "Quarterly Financial Report (Demo)",
    "text": "Quarterly Financial Report (Demo)\n\nThis is a sample report generated for the MinerU MVP pipeline test.\n\nThe purpose is to validate document upload, cloud parsing, and\n\nthe layout information returned by the MinerU extract API.\n\nTotal revenue in Q3 was 12.5 billion CNY, up 18.2% year over year.\n\nGross margin reached 41.6%, while operating expenses were 4.8 billion.",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 33,
      "fullmd_start": 3,
      "fullmd_len": 33,
      "page_idx": 0,
      "bbox": [
       90,
       83,
       534,
       105
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 35,
      "chunk_len": 67,
      "fullmd_start": 38,
      "fullmd_len": 67,
      "page_idx": 0,
      "bbox": [
       90,
       137,
       648,
       155
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 104,
      "chunk_len": 62,
      "fullmd_start": 107,
      "fullmd_len": 62,
      "page_idx": 0,
      "bbox": [
       90,
       162,
       618,
       179
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 168,
      "chunk_len": 58,
      "fullmd_start": 171,
      "fullmd_len": 58,
      "page_idx": 0,
      "bbox": [
       90,
       185,
       569,
       203
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 228,
      "chunk_len": 66,
      "fullmd_start": 231,
      "fullmd_len": 66,
      "page_idx": 0,
      "bbox": [
       89,
       231,
       652,
       250
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 296,
      "chunk_len": 70,
      "fullmd_start": 299,
      "fullmd_len": 70,
      "page_idx": 0,
      "bbox": [
       90,
       256,
       689,
       273
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_002",
    "doc_id": "a00ce40c_sample_report",
    "section_title": "Quarterly Results (Unit: billion CNY)",
    "text": "Quarterly Results (Unit: billion CNY)",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 37,
      "fullmd_start": 374,
      "fullmd_len": 37,
      "page_idx": 1,
      "bbox": [
       90,
       86,
       470,
       105
      ],
      "block_type": "title"
     }
    ]
   }
  ],
  "extractions": [
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "Total revenue",
    "attributes": {
     "entity_type": "metric",
     "normalized_name": "total_revenue"
    },
    "char_interval": {
     "start_pos": 228,
     "end_pos": 241
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "Q3",
    "attributes": {
     "entity_type": "period",
     "normalized_name": "q3"
    },
    "char_interval": {
     "start_pos": 245,
     "end_pos": 247
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "12.5 billion CNY",
    "attributes": {
     "entity_type": "currency_value",
     "normalized_name": "12.5_billion_cny"
    },
    "char_interval": {
     "start_pos": 252,
     "end_pos": 268
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "18.2%",
    "attributes": {
     "entity_type": "percentage",
     "normalized_name": "18.2%"
    },
    "char_interval": {
     "start_pos": 273,
     "end_pos": 278
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "Gross margin",
    "attributes": {
     "entity_type": "metric",
     "normalized_name": "gross_margin"
    },
    "char_interval": {
     "start_pos": 296,
     "end_pos": 308
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "41.6%",
    "attributes": {
     "entity_type": "percentage",
     "normalized_name": "41.6%"
    },
    "char_interval": {
     "start_pos": 317,
     "end_pos": 322
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "operating expenses",
    "attributes": {
     "entity_type": "metric",
     "normalized_name": "operating_expenses"
    },
    "char_interval": {
     "start_pos": 330,
     "end_pos": 348
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "4.8 billion",
    "attributes": {
     "entity_type": "currency_value",
     "normalized_name": "4.8_billion"
    },
    "char_interval": {
     "start_pos": 354,
     "end_pos": 365
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "relation",
    "extraction_text": "Total revenue in Q3 was 12.5 billion CNY",
    "attributes": {
     "head": "Total revenue",
     "predicate": "has_value",
     "tail": "12.5 billion CNY",
     "value": "12.5 billion CNY",
     "unit": "CNY",
     "period": "Q3"
    },
    "char_interval": {
     "start_pos": 228,
     "end_pos": 268
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "relation",
    "extraction_text": "up 18.2% year over year",
    "attributes": {
     "head": "Total revenue",
     "predicate": "grew_by",
     "tail": "18.2%",
     "period": "Q3"
    },
    "char_interval": {
     "start_pos": 270,
     "end_pos": 293
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "relation",
    "extraction_text": "Gross margin reached 41.6%",
    "attributes": {
     "head": "Gross margin",
     "predicate": "has_value",
     "tail": "41.6%",
     "value": "41.6%"
    },
    "char_interval": {
     "start_pos": 296,
     "end_pos": 322
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "a00ce40c_sample_report_chunk_001",
    "extraction_class": "relation",
    "extraction_text": "operating expenses were 4.8 billion",
    "attributes": {
     "head": "operating expenses",
     "predicate": "has_value",
     "tail": "4.8 billion",
     "value": "4.8 billion"
    },
    "char_interval": {
     "start_pos": 330,
     "end_pos": 365
    },
    "alignment_status": "match_exact",
    "grounded": true
   }
  ],
  "entities": [
   {
    "name": "Total revenue",
    "entity_type": "metric",
    "normalized_name": "total_revenue",
    "mentions": 1
   },
   {
    "name": "Q3",
    "entity_type": "period",
    "normalized_name": "q3",
    "mentions": 2
   },
   {
    "name": "12.5 billion CNY",
    "entity_type": "currency_value",
    "normalized_name": "12.5_billion_cny",
    "mentions": 1
   },
   {
    "name": "18.2%",
    "entity_type": "percentage",
    "normalized_name": "18.2%",
    "mentions": 1
   },
   {
    "name": "Gross margin",
    "entity_type": "metric",
    "normalized_name": "gross_margin",
    "mentions": 1
   },
   {
    "name": "41.6%",
    "entity_type": "percentage",
    "normalized_name": "41.6%",
    "mentions": 1
   },
   {
    "name": "operating expenses",
    "entity_type": "metric",
    "normalized_name": "operating_expenses",
    "mentions": 1
   },
   {
    "name": "4.8 billion",
    "entity_type": "currency_value",
    "normalized_name": "4.8_billion",
    "mentions": 1
   },
   {
    "name": "Q1",
    "entity_type": "period",
    "normalized_name": "q1",
    "mentions": 1
   },
   {
    "name": "Q2",
    "entity_type": "period",
    "normalized_name": "q2",
    "mentions": 1
   }
  ],
  "triples": [
   {
    "triple_id": "t_000001",
    "head": {
     "name": "Total revenue",
     "type": "unknown",
     "normalized_name": "total revenue"
    },
    "predicate": "has_value",
    "tail": {
     "name": "12.5 billion CNY",
     "type": "unknown",
     "normalized_name": "12.5 billion cny",
     "attributes": {
      "value": "12.5 billion CNY",
      "unit": "CNY",
      "period": "Q3"
     }
    },
    "evidence": {
     "text_span": "Total revenue in Q3 was 12.5 billion CNY",
     "source": "full.md",
     "chunk_id": "a00ce40c_sample_report_chunk_001",
     "char_interval_chunk": {
      "start_pos": 228,
      "end_pos": 268
     },
     "char_interval_fullmd": {
      "start_pos": 231,
      "end_pos": 271
     },
     "page_idx": 0
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000002",
    "head": {
     "name": "Total revenue",
     "type": "unknown",
     "normalized_name": "total revenue"
    },
    "predicate": "grew_by",
    "tail": {
     "name": "18.2%",
     "type": "unknown",
     "normalized_name": "18.2%",
     "attributes": {
      "period": "Q3"
     }
    },
    "evidence": {
     "text_span": "up 18.2% year over year",
     "source": "full.md",
     "chunk_id": "a00ce40c_sample_report_chunk_001",
     "char_interval_chunk": {
      "start_pos": 270,
      "end_pos": 293
     },
     "char_interval_fullmd": {
      "start_pos": 273,
      "end_pos": 296
     },
     "page_idx": 0
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000003",
    "head": {
     "name": "Gross margin",
     "type": "unknown",
     "normalized_name": "gross margin"
    },
    "predicate": "has_value",
    "tail": {
     "name": "41.6%",
     "type": "unknown",
     "normalized_name": "41.6%",
     "attributes": {
      "value": "41.6%"
     }
    },
    "evidence": {
     "text_span": "Gross margin reached 41.6%",
     "source": "full.md",
     "chunk_id": "a00ce40c_sample_report_chunk_001",
     "char_interval_chunk": {
      "start_pos": 296,
      "end_pos": 322
     },
     "char_interval_fullmd": {
      "start_pos": 299,
      "end_pos": 325
     },
     "page_idx": 0
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000004",
    "head": {
     "name": "operating expenses",
     "type": "unknown",
     "normalized_name": "operating expenses"
    },
    "predicate": "has_value",
    "tail": {
     "name": "4.8 billion",
     "type": "unknown",
     "normalized_name": "4.8 billion",
     "attributes": {
      "value": "4.8 billion"
     }
    },
    "evidence": {
     "text_span": "operating expenses were 4.8 billion",
     "source": "full.md",
     "chunk_id": "a00ce40c_sample_report_chunk_001",
     "char_interval_chunk": {
      "start_pos": 330,
      "end_pos": 365
     },
     "char_interval_fullmd": {
      "start_pos": 333,
      "end_pos": 368
     },
     "page_idx": 0
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000005",
    "head": {
     "name": "Q1",
     "type": "period",
     "normalized_name": "q1"
    },
    "predicate": "has_revenue",
    "tail": {
     "name": "8.3 billion CNY",
     "type": "metric_value",
     "normalized_name": "8.3 billion cny",
     "attributes": {
      "column": "Revenue",
      "unit": "billion CNY"
     }
    },
    "evidence": {
     "text_span": "8.3",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 1,
     "bbox_normalized": [
      92,
      156,
      857,
      280
     ],
     "table_image": "images/e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000006",
    "head": {
     "name": "Q1",
     "type": "period",
     "normalized_name": "q1"
    },
    "predicate": "has_net_profit",
    "tail": {
     "name": "0.9 billion CNY",
     "type": "metric_value",
     "normalized_name": "0.9 billion cny",
     "attributes": {
      "column": "Net Profit",
      "unit": "billion CNY"
     }
    },
    "evidence": {
     "text_span": "0.9",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 1,
     "bbox_normalized": [
      92,
      156,
      857,
      280
     ],
     "table_image": "images/e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000007",
    "head": {
     "name": "Q1",
     "type": "period",
     "normalized_name": "q1"
    },
    "predicate": "has_margin",
    "tail": {
     "name": "10.8%",
     "type": "metric_value",
     "normalized_name": "10.8%",
     "attributes": {
      "column": "Margin"
     }
    },
    "evidence": {
     "text_span": "10.8%",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 1,
     "bbox_normalized": [
      92,
      156,
      857,
      280
     ],
     "table_image": "images/e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000008",
    "head": {
     "name": "Q2",
     "type": "period",
     "normalized_name": "q2"
    },
    "predicate": "has_revenue",
    "tail": {
     "name": "10.1 billion CNY",
     "type": "metric_value",
     "normalized_name": "10.1 billion cny",
     "attributes": {
      "column": "Revenue",
      "unit": "billion CNY"
     }
    },
    "evidence": {
     "text_span": "10.1",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 1,
     "bbox_normalized": [
      92,
      156,
      857,
      280
     ],
     "table_image": "images/e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000009",
    "head": {
     "name": "Q2",
     "type": "period",
     "normalized_name": "q2"
    },
    "predicate": "has_net_profit",
    "tail": {
     "name": "1.2 billion CNY",
     "type": "metric_value",
     "normalized_name": "1.2 billion cny",
     "attributes": {
      "column": "Net Profit",
      "unit": "billion CNY"
     }
    },
    "evidence": {
     "text_span": "1.2",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 1,
     "bbox_normalized": [
      92,
      156,
      857,
      280
     ],
     "table_image": "images/e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000010",
    "head": {
     "name": "Q2",
     "type": "period",
     "normalized_name": "q2"
    },
    "predicate": "has_margin",
    "tail": {
     "name": "11.9%",
     "type": "metric_value",
     "normalized_name": "11.9%",
     "attributes": {
      "column": "Margin"
     }
    },
    "evidence": {
     "text_span": "11.9%",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 1,
     "bbox_normalized": [
      92,
      156,
      857,
      280
     ],
     "table_image": "images/e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000011",
    "head": {
     "name": "Q3",
     "type": "period",
     "normalized_name": "q3"
    },
    "predicate": "has_revenue",
    "tail": {
     "name": "12.5 billion CNY",
     "type": "metric_value",
     "normalized_name": "12.5 billion cny",
     "attributes": {
      "column": "Revenue",
      "unit": "billion CNY"
     }
    },
    "evidence": {
     "text_span": "12.5",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 1,
     "bbox_normalized": [
      92,
      156,
      857,
      280
     ],
     "table_image": "images/e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000012",
    "head": {
     "name": "Q3",
     "type": "period",
     "normalized_name": "q3"
    },
    "predicate": "has_net_profit",
    "tail": {
     "name": "1.6 billion CNY",
     "type": "metric_value",
     "normalized_name": "1.6 billion cny",
     "attributes": {
      "column": "Net Profit",
      "unit": "billion CNY"
     }
    },
    "evidence": {
     "text_span": "1.6",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 1,
     "bbox_normalized": [
      92,
      156,
      857,
      280
     ],
     "table_image": "images/e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000013",
    "head": {
     "name": "Q3",
     "type": "period",
     "normalized_name": "q3"
    },
    "predicate": "has_margin",
    "tail": {
     "name": "12.8%",
     "type": "metric_value",
     "normalized_name": "12.8%",
     "attributes": {
      "column": "Margin"
     }
    },
    "evidence": {
     "text_span": "12.8%",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 1,
     "bbox_normalized": [
      92,
      156,
      857,
      280
     ],
     "table_image": "images/e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg"
    },
    "provenance": {
     "path": "table"
    }
   }
  ],
  "_meta": {
   "page_count": 2,
   "n_chunks": 2,
   "n_entities": 10,
   "n_triples": 13
  }
 },
 "dd68cea4_sample_graphrag_overview": {
  "doc_id": "dd68cea4_sample_graphrag_overview",
  "full_md": "# GraphRAG System\n\nTechnical Architecture Overview\n\nVersion 1.0 | March 2026\n\n## 1. Abstract\n\nThis document presents the technical architecture of a Multimodal GraphRAG System designed for intelligent document parsing and knowledge graph construction. The system integrates MinerU fo document parsing, LangExtract for structured entity extraction, and a graph database for knowledge storage and retrieval.\n\nThe pipeline supports multiple document formats including PDF, DOCX, PPTX, and image files. Extracted entities and relations are stored as graph nodes and edges, enabling semantic search and question answering over large document collections.\n\n## 2. System Components\n\n## 2.1 Document Parsing Module\n\nMinerU Cloud API (v4) serves as the document parsing backend. It accepts PDF, DOCX, PPTX, PNG, JPG, and HTML files. Output includes Markdown text, structured content\\_list.json, and extracted images.\n\n## 2.2 Entity Extraction Module\n\nLangExtract (v1.1.1) performs structured information extraction from plain text using few-shot prompting with LLM backends (Gemini, OpenAI, or local Ollama). Each extraction includes character-level position anchoring.\n\n## 2.3 Knowledge Graph Module\n\nExtracted entities and relationships are stored in a graph database. Node types include: Person, Organization, Location, Event, Concept. Edge types include: RELATED\\_TO, BELONGS\\_TO, CAUSED\\_BY, LOCATED\\_IN.\n\n## 2.4 Retrieval Module\n\nThe retrieval layer supports hybrid search combining vector similarity and graph traversal. Query results are ranked by relevance score and returned with source document references.\n\n## 3. Data Pipeline\n\nThe end-to-end data pipeline consists of the following stages:\n\n## Stage 1: Document Ingestion\n\n\\- Accept raw documents (PDF, DOCX, images, HTML)\n\n\\- Submit to MinerU API for parsing\n\n\\- Poll task status until state = done\n\n## Stage 2: Content Extraction\n\n\\- Download and decompress full\\_zip\\_url\n\n\\- Parse content\\_list.json into Document objects\n\n\\- Separate text blocks, tables, images, equations\n\n## Stage 3: Entity & Relation Extraction\n\n\\- Feed text blocks to LangExtract\n\n\\- Extract entities with char\\_interval positions\n\n\\- Extract relationships between entities\n\n## Stage 4: Graph Construction\n\n\\- Map extractions to graph nodes and edges\n\n\\- Store with source provenance (page\\_idx, bbox)\n\n\\- Build vector embeddings for semantic search\n\n## 4. Supported File Formats\n\n<table><tr><td>Format</td><td>Extension</td><td>OCR Required</td><td>Model</td></tr><tr><td>PDF (text)</td><td>.pdf</td><td>No</td><td>pipeline / vlm</td></tr><tr><td>PDF (scan)</td><td>.pdf</td><td>Yes</td><td>vlm</td></tr><tr><td>Word</td><td>.docx</td><td>No</td><td>pipeline</td></tr><tr><td>PowerPoint</td><td>.pptx</td><td>No</td><td>pipeline</td></tr><tr><td>Image</td><td>.png / . jpg</td><td>Auto</td><td>vlm</td></tr><tr><td>HTML</td><td>.html</td><td>No</td><td>MinerU-HTML</td></tr></table>\n\n```txt\nMINERU_API_TOKEN : Bearer token for API authentication\nMINERU_USER_UID : User UUID for quota management\nMINERU_BASE_URL : https://mineru.net/api/v4\nMINERU_MODEL_VERSION : pipeline (default) | vlm | MinerU-HTML\nMINERU_LANGUAGE : ch (Chinese) | en (English)\nMINERU_IS_OCR : false (text PDF) | true (scanned PDF)\nMINERU_ENABLE_FORMULA: true | false\nMINERU_ENABLE_TABLE : true | false\n```\n\n## 5. API Configuration Reference\n\nThe following environment variables must be configured before running the MinerU parsing service:\n\nRate Limits:\n\n\\- Max file size : 200 MB per file\n\n\\- Max pages : 600 pages per file\n\n\\- Daily quota : 2000 pages (high priority)\n\n\\- Batch limit : 200 files per request",
  "chunks": [
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_001",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "GraphRAG System",
    "text": "GraphRAG System\n\nTechnical Architecture Overview\n\nVersion 1.0 | March 2026",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 15,
      "fullmd_start": 2,
      "fullmd_len": 15,
      "page_idx": 0,
      "bbox": [
       342,
       175,
       655,
       206
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 17,
      "chunk_len": 31,
      "fullmd_start": 19,
      "fullmd_len": 31,
      "page_idx": 0,
      "bbox": [
       285,
       234,
       712,
       256
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 50,
      "chunk_len": 24,
      "fullmd_start": 52,
      "fullmd_len": 24,
      "page_idx": 0,
      "bbox": [
       361,
       272,
       636,
       291
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_002",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "1. Abstract",
    "text": "1. Abstract\n\nThis document presents the technical architecture of a Multimodal GraphRAG System designed for intelligent document parsing and knowledge graph construction. The system integrates MinerU fo document parsing, LangExtract for structured entity extraction, and a graph database for knowledge storage and retrieval.\n\nThe pipeline supports multiple document formats including PDF, DOCX, PPTX, and image files. Extracted entities and relations are stored as graph nodes and edges, enabling semantic search and question answering over large document collections.",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 11,
      "fullmd_start": 81,
      "fullmd_len": 11,
      "page_idx": 1,
      "bbox": [
       48,
       43,
       201,
       61
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 13,
      "chunk_len": 311,
      "fullmd_start": 94,
      "fullmd_len": 311,
      "page_idx": 1,
      "bbox": [
       45,
       84,
       951,
       170
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 326,
      "chunk_len": 242,
      "fullmd_start": 407,
      "fullmd_len": 242,
      "page_idx": 1,
      "bbox": [
       43,
       200,
       949,
       265
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_003",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "2. System Components",
    "text": "2. System Components",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 20,
      "fullmd_start": 654,
      "fullmd_len": 20,
      "page_idx": 1,
      "bbox": [
       45,
       299,
       322,
       318
      ],
      "block_type": "title"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_004",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "2.1 Document Parsing Module",
    "text": "2.1 Document Parsing Module\n\nMinerU Cloud API (v4) serves as the document parsing backend. It accepts PDF, DOCX, PPTX, PNG, JPG, and HTML files. Output includes Markdown text, structured content\\_list.json, and extracted images.",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 27,
      "fullmd_start": 679,
      "fullmd_len": 27,
      "page_idx": 1,
      "bbox": [
       45,
       344,
       351,
       361
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 29,
      "chunk_len": 199,
      "fullmd_start": 708,
      "fullmd_len": 199,
      "page_idx": 1,
      "bbox": [
       45,
       373,
       949,
       436
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_005",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "2.2 Entity Extraction Module",
    "text": "2.2 Entity Extraction Module\n\nLangExtract (v1.1.1) performs structured information extraction from plain text using few-shot prompting with LLM backends (Gemini, OpenAI, or local Ollama). Each extraction includes character-level position anchoring.",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 28,
      "fullmd_start": 912,
      "fullmd_len": 28,
      "page_idx": 1,
      "bbox": [
       45,
       461,
       361,
       478
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 30,
      "chunk_len": 218,
      "fullmd_start": 942,
      "fullmd_len": 218,
      "page_idx": 1,
      "bbox": [
       43,
       491,
       949,
       554
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_006",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "2.3 Knowledge Graph Module",
    "text": "2.3 Knowledge Graph Module\n\nExtracted entities and relationships are stored in a graph database. Node types include: Person, Organization, Location, Event, Concept. Edge types include: RELATED\\_TO, BELONGS\\_TO, CAUSED\\_BY, LOCATED\\_IN.",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 26,
      "fullmd_start": 1165,
      "fullmd_len": 26,
      "page_idx": 1,
      "bbox": [
       45,
       579,
       339,
       596
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 28,
      "chunk_len": 207,
      "fullmd_start": 1193,
      "fullmd_len": 207,
      "page_idx": 1,
      "bbox": [
       43,
       609,
       944,
       671
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_007",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "2.4 Retrieval Module",
    "text": "2.4 Retrieval Module\n\nThe retrieval layer supports hybrid search combining vector similarity and graph traversal. Query results are ranked by relevance score and returned with source document references.",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 20,
      "fullmd_start": 1405,
      "fullmd_len": 20,
      "page_idx": 1,
      "bbox": [
       45,
       697,
       273,
       714
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 22,
      "chunk_len": 181,
      "fullmd_start": 1427,
      "fullmd_len": 181,
      "page_idx": 1,
      "bbox": [
       45,
       727,
       942,
       766
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_008",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "3. Data Pipeline",
    "text": "3. Data Pipeline\n\nThe end-to-end data pipeline consists of the following stages:",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 16,
      "fullmd_start": 1613,
      "fullmd_len": 16,
      "page_idx": 2,
      "bbox": [
       47,
       42,
       270,
       61
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 18,
      "chunk_len": 62,
      "fullmd_start": 1631,
      "fullmd_len": 62,
      "page_idx": 2,
      "bbox": [
       45,
       84,
       625,
       99
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_009",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "Stage 1: Document Ingestion",
    "text": "Stage 1: Document Ingestion\n\n\\- Accept raw documents (PDF, DOCX, images, HTML)\n\n\\- Submit to MinerU API for parsing\n\n\\- Poll task status until state = done",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 27,
      "fullmd_start": 1698,
      "fullmd_len": 27,
      "page_idx": 2,
      "bbox": [
       63,
       131,
       324,
       146
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 29,
      "chunk_len": 49,
      "fullmd_start": 1727,
      "fullmd_len": 49,
      "page_idx": 2,
      "bbox": [
       82,
       154,
       532,
       170
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 80,
      "chunk_len": 35,
      "fullmd_start": 1778,
      "fullmd_len": 35,
      "page_idx": 2,
      "bbox": [
       82,
       178,
       408,
       193
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 117,
      "chunk_len": 38,
      "fullmd_start": 1815,
      "fullmd_len": 38,
      "page_idx": 2,
      "bbox": [
       82,
       200,
       433,
       216
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_010",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "Stage 2: Content Extraction",
    "text": "Stage 2: Content Extraction\n\n\\- Download and decompress full\\_zip\\_url\n\n\\- Parse content\\_list.json into Document objects\n\n\\- Separate text blocks, tables, images, equations",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 27,
      "fullmd_start": 1858,
      "fullmd_len": 27,
      "page_idx": 2,
      "bbox": [
       63,
       248,
       324,
       263
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 29,
      "chunk_len": 41,
      "fullmd_start": 1887,
      "fullmd_len": 41,
      "page_idx": 2,
      "bbox": [
       82,
       272,
       442,
       288
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 72,
      "chunk_len": 49,
      "fullmd_start": 1930,
      "fullmd_len": 49,
      "page_idx": 2,
      "bbox": [
       82,
       296,
       526,
       311
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 123,
      "chunk_len": 50,
      "fullmd_start": 1981,
      "fullmd_len": 50,
      "page_idx": 2,
      "bbox": [
       82,
       319,
       544,
       335
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_011",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "Stage 3: Entity & Relation Extraction",
    "text": "Stage 3: Entity & Relation Extraction\n\n\\- Feed text blocks to LangExtract\n\n\\- Extract entities with char\\_interval positions\n\n\\- Extract relationships between entities",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 37,
      "fullmd_start": 2036,
      "fullmd_len": 37,
      "page_idx": 2,
      "bbox": [
       63,
       366,
       416,
       382
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 39,
      "chunk_len": 34,
      "fullmd_start": 2075,
      "fullmd_len": 34,
      "page_idx": 2,
      "bbox": [
       82,
       390,
       396,
       405
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 75,
      "chunk_len": 49,
      "fullmd_start": 2111,
      "fullmd_len": 49,
      "page_idx": 2,
      "bbox": [
       82,
       414,
       526,
       429
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 126,
      "chunk_len": 41,
      "fullmd_start": 2162,
      "fullmd_len": 41,
      "page_idx": 2,
      "bbox": [
       82,
       437,
       463,
       453
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_012",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "Stage 4: Graph Construction",
    "text": "Stage 4: Graph Construction\n\n\\- Map extractions to graph nodes and edges\n\n\\- Store with source provenance (page\\_idx, bbox)\n\n\\- Build vector embeddings for semantic search",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 27,
      "fullmd_start": 2208,
      "fullmd_len": 27,
      "page_idx": 2,
      "bbox": [
       63,
       483,
       324,
       500
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 29,
      "chunk_len": 43,
      "fullmd_start": 2237,
      "fullmd_len": 43,
      "page_idx": 2,
      "bbox": [
       82,
       508,
       480,
       524
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 74,
      "chunk_len": 49,
      "fullmd_start": 2282,
      "fullmd_len": 49,
      "page_idx": 2,
      "bbox": [
       82,
       531,
       522,
       546
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 125,
      "chunk_len": 46,
      "fullmd_start": 2333,
      "fullmd_len": 46,
      "page_idx": 2,
      "bbox": [
       82,
       555,
       509,
       571
      ],
      "block_type": "text"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_013",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "4. Supported File Formats",
    "text": "4. Supported File Formats",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 25,
      "fullmd_start": 2384,
      "fullmd_len": 25,
      "page_idx": 2,
      "bbox": [
       45,
       602,
       327,
       621
      ],
      "block_type": "title"
     }
    ]
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "doc_id": "dd68cea4_sample_graphrag_overview",
    "section_title": "5. API Configuration Reference",
    "text": "5. API Configuration Reference\n\nThe following environment variables must be configured before running the MinerU parsing service:\n\nRate Limits:\n\n\\- Max file size : 200 MB per file\n\n\\- Max pages : 600 pages per file\n\n\\- Daily quota : 2000 pages (high priority)\n\n\\- Batch limit : 200 files per request",
    "blocks": [
     {
      "chunk_start": 0,
      "chunk_len": 30,
      "fullmd_start": 3311,
      "fullmd_len": 30,
      "page_idx": 3,
      "bbox": [
       45,
       41,
       457,
       63
      ],
      "block_type": "title"
     },
     {
      "chunk_start": 32,
      "chunk_len": 97,
      "fullmd_start": 3343,
      "fullmd_len": 97,
      "page_idx": 3,
      "bbox": [
       45,
       83,
       951,
       123
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 131,
      "chunk_len": 12,
      "fullmd_start": 3442,
      "fullmd_len": 12,
      "page_idx": 3,
      "bbox": [
       45,
       365,
       164,
       382
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 145,
      "chunk_len": 34,
      "fullmd_start": 3456,
      "fullmd_len": 34,
      "page_idx": 3,
      "bbox": [
       63,
       388,
       408,
       407
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 181,
      "chunk_len": 33,
      "fullmd_start": 3492,
      "fullmd_len": 33,
      "page_idx": 3,
      "bbox": [
       63,
       412,
       436,
       431
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 216,
      "chunk_len": 43,
      "fullmd_start": 3527,
      "fullmd_len": 43,
      "page_idx": 3,
      "bbox": [
       62,
       436,
       505,
       455
      ],
      "block_type": "text"
     },
     {
      "chunk_start": 261,
      "chunk_len": 38,
      "fullmd_start": 3572,
      "fullmd_len": 38,
      "page_idx": 3,
      "bbox": [
       62,
       458,
       465,
       478
      ],
      "block_type": "text"
     }
    ]
   }
  ],
  "extractions": [
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "GraphRAG System",
    "attributes": {
     "entity_type": "company",
     "normalized_name": "graphrag_system"
    },
    "char_interval": {
     "start_pos": 0,
     "end_pos": 15
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "Version 1.0",
    "attributes": {
     "entity_type": "metric",
     "normalized_name": "version_1.0"
    },
    "char_interval": {
     "start_pos": 50,
     "end_pos": 61
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_001",
    "extraction_class": "entity",
    "extraction_text": "March 2026",
    "attributes": {
     "entity_type": "period",
     "normalized_name": "march_2026"
    },
    "char_interval": {
     "start_pos": 64,
     "end_pos": 74
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_001",
    "extraction_class": "relation",
    "extraction_text": "Version 1.0 | March 2026",
    "attributes": {
     "head": "GraphRAG System",
     "predicate": "has_version",
     "tail": "Version 1.0",
     "value": "1.0",
     "period": "March 2026"
    },
    "char_interval": {
     "start_pos": 50,
     "end_pos": 74
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_005",
    "extraction_class": "entity",
    "extraction_text": "LangExtract",
    "attributes": {
     "entity_type": "company",
     "normalized_name": "langextract"
    },
    "char_interval": {
     "start_pos": 30,
     "end_pos": 41
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_005",
    "extraction_class": "entity",
    "extraction_text": "OpenAI",
    "attributes": {
     "entity_type": "company",
     "normalized_name": "openai"
    },
    "char_interval": {
     "start_pos": 162,
     "end_pos": 168
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_005",
    "extraction_class": "entity",
    "extraction_text": "Ollama",
    "attributes": {
     "entity_type": "company",
     "normalized_name": "ollama"
    },
    "char_interval": {
     "start_pos": 179,
     "end_pos": 185
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_005",
    "extraction_class": "relation",
    "extraction_text": "LangExtract (v1.1.1) performs structured information extraction from plain text using few-shot prompting with LLM backends (Gemini, OpenAI, or local Ollama)",
    "attributes": {
     "head": "LangExtract",
     "predicate": "uses_backend",
     "tail": "OpenAI"
    },
    "char_interval": {
     "start_pos": 30,
     "end_pos": 186
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_005",
    "extraction_class": "relation",
    "extraction_text": "LangExtract (v1.1.1) performs structured information extraction from plain text using few-shot prompting with LLM backends (Gemini, OpenAI, or local Ollama)",
    "attributes": {
     "head": "LangExtract",
     "predicate": "uses_backend",
     "tail": "Ollama"
    },
    "char_interval": {
     "start_pos": 30,
     "end_pos": 186
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "extraction_class": "entity",
    "extraction_text": "MinerU parsing service",
    "attributes": {
     "entity_type": "company",
     "normalized_name": "mineru_parsing_service"
    },
    "char_interval": {
     "start_pos": 106,
     "end_pos": 128
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "extraction_class": "entity",
    "extraction_text": "Max file size",
    "attributes": {
     "entity_type": "metric",
     "normalized_name": "max_file_size"
    },
    "char_interval": {
     "start_pos": 148,
     "end_pos": 161
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "extraction_class": "entity",
    "extraction_text": "Max pages",
    "attributes": {
     "entity_type": "metric",
     "normalized_name": "max_pages"
    },
    "char_interval": {
     "start_pos": 184,
     "end_pos": 193
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "extraction_class": "entity",
    "extraction_text": "Daily quota",
    "attributes": {
     "entity_type": "metric",
     "normalized_name": "daily_quota"
    },
    "char_interval": {
     "start_pos": 219,
     "end_pos": 230
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "extraction_class": "entity",
    "extraction_text": "Batch limit",
    "attributes": {
     "entity_type": "metric",
     "normalized_name": "batch_limit"
    },
    "char_interval": {
     "start_pos": 264,
     "end_pos": 275
    },
    "alignment_status": "match_fuzzy",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "extraction_class": "relation",
    "extraction_text": "Max file size : 200 MB per file",
    "attributes": {
     "head": "MinerU parsing service",
     "predicate": "has_metric",
     "tail": "Max file size",
     "value": "200 MB",
     "unit": "MB"
    },
    "char_interval": {
     "start_pos": 148,
     "end_pos": 179
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "extraction_class": "relation",
    "extraction_text": "Max pages : 600 pages per file",
    "attributes": {
     "head": "MinerU parsing service",
     "predicate": "has_metric",
     "tail": "Max pages",
     "value": "600 pages",
     "unit": "pages"
    },
    "char_interval": {
     "start_pos": 184,
     "end_pos": 214
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "extraction_class": "relation",
    "extraction_text": "Daily quota : 2000 pages (high priority)",
    "attributes": {
     "head": "MinerU parsing service",
     "predicate": "has_metric",
     "tail": "Daily quota",
     "value": "2000 pages",
     "unit": "pages"
    },
    "char_interval": {
     "start_pos": 219,
     "end_pos": 259
    },
    "alignment_status": "match_exact",
    "grounded": true
   },
   {
    "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
    "extraction_class": "relation",
    "extraction_text": "Batch limit : 200 files per request",
    "attributes": {
     "head": "MinerU parsing service",
     "predicate": "has_metric",
     "tail": "Batch limit",
     "value": "200 files",
     "unit": "files"
    },
    "char_interval": {
     "start_pos": 264,
     "end_pos": 299
    },
    "alignment_status": "match_exact",
    "grounded": true
   }
  ],
  "entities": [
   {
    "name": "GraphRAG System",
    "entity_type": "company",
    "normalized_name": "graphrag_system",
    "mentions": 1
   },
   {
    "name": "Version 1.0",
    "entity_type": "metric",
    "normalized_name": "version_1.0",
    "mentions": 1
   },
   {
    "name": "March 2026",
    "entity_type": "period",
    "normalized_name": "march_2026",
    "mentions": 1
   },
   {
    "name": "LangExtract",
    "entity_type": "company",
    "normalized_name": "langextract",
    "mentions": 1
   },
   {
    "name": "OpenAI",
    "entity_type": "company",
    "normalized_name": "openai",
    "mentions": 1
   },
   {
    "name": "Ollama",
    "entity_type": "company",
    "normalized_name": "ollama",
    "mentions": 1
   },
   {
    "name": "MinerU parsing service",
    "entity_type": "company",
    "normalized_name": "mineru_parsing_service",
    "mentions": 1
   },
   {
    "name": "Max file size",
    "entity_type": "metric",
    "normalized_name": "max_file_size",
    "mentions": 1
   },
   {
    "name": "Max pages",
    "entity_type": "metric",
    "normalized_name": "max_pages",
    "mentions": 1
   },
   {
    "name": "Daily quota",
    "entity_type": "metric",
    "normalized_name": "daily_quota",
    "mentions": 1
   },
   {
    "name": "Batch limit",
    "entity_type": "metric",
    "normalized_name": "batch_limit",
    "mentions": 1
   },
   {
    "name": "PDF (text)",
    "entity_type": "period",
    "normalized_name": "pdf (text)",
    "mentions": 1
   },
   {
    "name": "PDF (scan)",
    "entity_type": "period",
    "normalized_name": "pdf (scan)",
    "mentions": 1
   },
   {
    "name": "Word",
    "entity_type": "period",
    "normalized_name": "word",
    "mentions": 1
   },
   {
    "name": "PowerPoint",
    "entity_type": "period",
    "normalized_name": "powerpoint",
    "mentions": 1
   },
   {
    "name": "Image",
    "entity_type": "period",
    "normalized_name": "image",
    "mentions": 1
   },
   {
    "name": "HTML",
    "entity_type": "period",
    "normalized_name": "html",
    "mentions": 1
   }
  ],
  "triples": [
   {
    "triple_id": "t_000001",
    "head": {
     "name": "GraphRAG System",
     "type": "unknown",
     "normalized_name": "graphrag system"
    },
    "predicate": "has_version",
    "tail": {
     "name": "Version 1.0",
     "type": "unknown",
     "normalized_name": "version 1.0",
     "attributes": {
      "value": "1.0",
      "period": "March 2026"
     }
    },
    "evidence": {
     "text_span": "Version 1.0 | March 2026",
     "source": "full.md",
     "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_001",
     "char_interval_chunk": {
      "start_pos": 50,
      "end_pos": 74
     },
     "char_interval_fullmd": {
      "start_pos": 52,
      "end_pos": 76
     },
     "page_idx": 0
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000002",
    "head": {
     "name": "LangExtract",
     "type": "unknown",
     "normalized_name": "langextract"
    },
    "predicate": "uses_backend",
    "tail": {
     "name": "OpenAI",
     "type": "unknown",
     "normalized_name": "openai",
     "attributes": {}
    },
    "evidence": {
     "text_span": "LangExtract (v1.1.1) performs structured information extraction from plain text using few-shot prompting with LLM backends (Gemini, OpenAI, or local Ollama)",
     "source": "full.md",
     "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_005",
     "char_interval_chunk": {
      "start_pos": 30,
      "end_pos": 186
     },
     "char_interval_fullmd": {
      "start_pos": 942,
      "end_pos": 1098
     },
     "page_idx": 1
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000003",
    "head": {
     "name": "LangExtract",
     "type": "unknown",
     "normalized_name": "langextract"
    },
    "predicate": "uses_backend",
    "tail": {
     "name": "Ollama",
     "type": "unknown",
     "normalized_name": "ollama",
     "attributes": {}
    },
    "evidence": {
     "text_span": "LangExtract (v1.1.1) performs structured information extraction from plain text using few-shot prompting with LLM backends (Gemini, OpenAI, or local Ollama)",
     "source": "full.md",
     "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_005",
     "char_interval_chunk": {
      "start_pos": 30,
      "end_pos": 186
     },
     "char_interval_fullmd": {
      "start_pos": 942,
      "end_pos": 1098
     },
     "page_idx": 1
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000004",
    "head": {
     "name": "MinerU parsing service",
     "type": "unknown",
     "normalized_name": "mineru parsing service"
    },
    "predicate": "has_metric",
    "tail": {
     "name": "Max file size",
     "type": "unknown",
     "normalized_name": "max file size",
     "attributes": {
      "value": "200 MB",
      "unit": "MB"
     }
    },
    "evidence": {
     "text_span": "Max file size : 200 MB per file",
     "source": "full.md",
     "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
     "char_interval_chunk": {
      "start_pos": 148,
      "end_pos": 179
     },
     "char_interval_fullmd": {
      "start_pos": 3459,
      "end_pos": 3490
     },
     "page_idx": 3
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000005",
    "head": {
     "name": "MinerU parsing service",
     "type": "unknown",
     "normalized_name": "mineru parsing service"
    },
    "predicate": "has_metric",
    "tail": {
     "name": "Max pages",
     "type": "unknown",
     "normalized_name": "max pages",
     "attributes": {
      "value": "600 pages",
      "unit": "pages"
     }
    },
    "evidence": {
     "text_span": "Max pages : 600 pages per file",
     "source": "full.md",
     "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
     "char_interval_chunk": {
      "start_pos": 184,
      "end_pos": 214
     },
     "char_interval_fullmd": {
      "start_pos": 3495,
      "end_pos": 3525
     },
     "page_idx": 3
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000006",
    "head": {
     "name": "MinerU parsing service",
     "type": "unknown",
     "normalized_name": "mineru parsing service"
    },
    "predicate": "has_metric",
    "tail": {
     "name": "Daily quota",
     "type": "unknown",
     "normalized_name": "daily quota",
     "attributes": {
      "value": "2000 pages",
      "unit": "pages"
     }
    },
    "evidence": {
     "text_span": "Daily quota : 2000 pages (high priority)",
     "source": "full.md",
     "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
     "char_interval_chunk": {
      "start_pos": 219,
      "end_pos": 259
     },
     "char_interval_fullmd": {
      "start_pos": 3530,
      "end_pos": 3570
     },
     "page_idx": 3
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000007",
    "head": {
     "name": "MinerU parsing service",
     "type": "unknown",
     "normalized_name": "mineru parsing service"
    },
    "predicate": "has_metric",
    "tail": {
     "name": "Batch limit",
     "type": "unknown",
     "normalized_name": "batch limit",
     "attributes": {
      "value": "200 files",
      "unit": "files"
     }
    },
    "evidence": {
     "text_span": "Batch limit : 200 files per request",
     "source": "full.md",
     "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_014",
     "char_interval_chunk": {
      "start_pos": 264,
      "end_pos": 299
     },
     "char_interval_fullmd": {
      "start_pos": 3575,
      "end_pos": 3610
     },
     "page_idx": 3
    },
    "provenance": {
     "path": "narrative"
    }
   },
   {
    "triple_id": "t_000008",
    "head": {
     "name": "PDF (text)",
     "type": "period",
     "normalized_name": "pdf (text)"
    },
    "predicate": "has_extension",
    "tail": {
     "name": ".pdf",
     "type": "metric_value",
     "normalized_name": ".pdf",
     "attributes": {
      "column": "Extension"
     }
    },
    "evidence": {
     "text_span": ".pdf",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000009",
    "head": {
     "name": "PDF (text)",
     "type": "period",
     "normalized_name": "pdf (text)"
    },
    "predicate": "has_ocr_required",
    "tail": {
     "name": "No",
     "type": "metric_value",
     "normalized_name": "no",
     "attributes": {
      "column": "OCR Required"
     }
    },
    "evidence": {
     "text_span": "No",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000010",
    "head": {
     "name": "PDF (text)",
     "type": "period",
     "normalized_name": "pdf (text)"
    },
    "predicate": "has_model",
    "tail": {
     "name": "pipeline / vlm",
     "type": "metric_value",
     "normalized_name": "pipeline / vlm",
     "attributes": {
      "column": "Model"
     }
    },
    "evidence": {
     "text_span": "pipeline / vlm",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000011",
    "head": {
     "name": "PDF (scan)",
     "type": "period",
     "normalized_name": "pdf (scan)"
    },
    "predicate": "has_extension",
    "tail": {
     "name": ".pdf",
     "type": "metric_value",
     "normalized_name": ".pdf",
     "attributes": {
      "column": "Extension"
     }
    },
    "evidence": {
     "text_span": ".pdf",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000012",
    "head": {
     "name": "PDF (scan)",
     "type": "period",
     "normalized_name": "pdf (scan)"
    },
    "predicate": "has_ocr_required",
    "tail": {
     "name": "Yes",
     "type": "metric_value",
     "normalized_name": "yes",
     "attributes": {
      "column": "OCR Required"
     }
    },
    "evidence": {
     "text_span": "Yes",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000013",
    "head": {
     "name": "PDF (scan)",
     "type": "period",
     "normalized_name": "pdf (scan)"
    },
    "predicate": "has_model",
    "tail": {
     "name": "vlm",
     "type": "metric_value",
     "normalized_name": "vlm",
     "attributes": {
      "column": "Model"
     }
    },
    "evidence": {
     "text_span": "vlm",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000014",
    "head": {
     "name": "Word",
     "type": "period",
     "normalized_name": "word"
    },
    "predicate": "has_extension",
    "tail": {
     "name": ".docx",
     "type": "metric_value",
     "normalized_name": ".docx",
     "attributes": {
      "column": "Extension"
     }
    },
    "evidence": {
     "text_span": ".docx",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000015",
    "head": {
     "name": "Word",
     "type": "period",
     "normalized_name": "word"
    },
    "predicate": "has_ocr_required",
    "tail": {
     "name": "No",
     "type": "metric_value",
     "normalized_name": "no",
     "attributes": {
      "column": "OCR Required"
     }
    },
    "evidence": {
     "text_span": "No",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000016",
    "head": {
     "name": "Word",
     "type": "period",
     "normalized_name": "word"
    },
    "predicate": "has_model",
    "tail": {
     "name": "pipeline",
     "type": "metric_value",
     "normalized_name": "pipeline",
     "attributes": {
      "column": "Model"
     }
    },
    "evidence": {
     "text_span": "pipeline",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000017",
    "head": {
     "name": "PowerPoint",
     "type": "period",
     "normalized_name": "powerpoint"
    },
    "predicate": "has_extension",
    "tail": {
     "name": ".pptx",
     "type": "metric_value",
     "normalized_name": ".pptx",
     "attributes": {
      "column": "Extension"
     }
    },
    "evidence": {
     "text_span": ".pptx",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000018",
    "head": {
     "name": "PowerPoint",
     "type": "period",
     "normalized_name": "powerpoint"
    },
    "predicate": "has_ocr_required",
    "tail": {
     "name": "No",
     "type": "metric_value",
     "normalized_name": "no",
     "attributes": {
      "column": "OCR Required"
     }
    },
    "evidence": {
     "text_span": "No",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000019",
    "head": {
     "name": "PowerPoint",
     "type": "period",
     "normalized_name": "powerpoint"
    },
    "predicate": "has_model",
    "tail": {
     "name": "pipeline",
     "type": "metric_value",
     "normalized_name": "pipeline",
     "attributes": {
      "column": "Model"
     }
    },
    "evidence": {
     "text_span": "pipeline",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000020",
    "head": {
     "name": "Image",
     "type": "period",
     "normalized_name": "image"
    },
    "predicate": "has_extension",
    "tail": {
     "name": ".png / . jpg",
     "type": "metric_value",
     "normalized_name": ".png / . jpg",
     "attributes": {
      "column": "Extension"
     }
    },
    "evidence": {
     "text_span": ".png / . jpg",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000021",
    "head": {
     "name": "Image",
     "type": "period",
     "normalized_name": "image"
    },
    "predicate": "has_ocr_required",
    "tail": {
     "name": "Auto",
     "type": "metric_value",
     "normalized_name": "auto",
     "attributes": {
      "column": "OCR Required"
     }
    },
    "evidence": {
     "text_span": "Auto",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000022",
    "head": {
     "name": "Image",
     "type": "period",
     "normalized_name": "image"
    },
    "predicate": "has_model",
    "tail": {
     "name": "vlm",
     "type": "metric_value",
     "normalized_name": "vlm",
     "attributes": {
      "column": "Model"
     }
    },
    "evidence": {
     "text_span": "vlm",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000023",
    "head": {
     "name": "HTML",
     "type": "period",
     "normalized_name": "html"
    },
    "predicate": "has_extension",
    "tail": {
     "name": ".html",
     "type": "metric_value",
     "normalized_name": ".html",
     "attributes": {
      "column": "Extension"
     }
    },
    "evidence": {
     "text_span": ".html",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000024",
    "head": {
     "name": "HTML",
     "type": "period",
     "normalized_name": "html"
    },
    "predicate": "has_ocr_required",
    "tail": {
     "name": "No",
     "type": "metric_value",
     "normalized_name": "no",
     "attributes": {
      "column": "OCR Required"
     }
    },
    "evidence": {
     "text_span": "No",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   },
   {
    "triple_id": "t_000025",
    "head": {
     "name": "HTML",
     "type": "period",
     "normalized_name": "html"
    },
    "predicate": "has_model",
    "tail": {
     "name": "MinerU-HTML",
     "type": "metric_value",
     "normalized_name": "mineru-html",
     "attributes": {
      "column": "Model"
     }
    },
    "evidence": {
     "text_span": "MinerU-HTML",
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "page_idx": 2,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    "provenance": {
     "path": "table"
    }
   }
  ],
  "_meta": {
   "page_count": 4,
   "n_chunks": 14,
   "n_entities": 17,
   "n_triples": 25
  }
 }
},
  system: {
 "health": {
  "status": "ok",
  "version": "1.0.0",
  "uptime_s": 3600,
  "time": "2026-10-15T03:00:00Z",
  "checks": {
   "db": "ok",
   "mineru_token": "present",
   "deepseek_key": "present",
   "indexed_documents": 2,
   "jobs_running": 0,
   "job_queue_depth": 0
  }
 },
 "config": {
  "limits": {
   "max_file_bytes": 209715200,
   "max_files_per_request": 10,
   "max_pages": 600,
   "max_doc_ids_per_query": 5,
   "question_max_chars": 2000
  },
  "formats": {
   "pdf": [
    ".pdf"
   ],
   "image": [
    ".png",
    ".jpg",
    ".jpeg",
    ".jp2",
    ".webp",
    ".gif",
    ".bmp"
   ],
   "office": [
    ".doc",
    ".docx",
    ".ppt",
    ".pptx"
   ],
   "html": [
    ".html"
   ]
  },
  "qa": {
   "mode": "kg_only",
   "max_grade_retries": 2,
   "recursion_limit": 30
  },
  "models": {
   "chat": "deepseek-chat",
   "extract": "deepseek-chat"
  }
 }
},
  sessions: [{
 "session_id": "s_demo01",
 "title": "GraphRAG 系统的核心组件有哪些？各自负责什么？",
 "created_at": "2026-10-15T02:59:00Z",
 "last_message_at": "2026-10-15T03:00:00Z",
 "message_count": 1,
 "messages": [
  {
   "message_id": "m_demo0001",
   "question": "GraphRAG 系统的核心组件有哪些？各自负责什么？",
   "answer": "GraphRAG 系统由 Document Processor、Entity Extractor 与 Knowledge Graph Builder 三个核心组件构成：Document Processor 负责多格式文档解析与结构化，Entity Extractor 基于 LLM 抽取实体与关系，Knowledge Graph Builder 将抽取结果融合为可检索的知识图谱。",
   "citations": [
    {
     "triple_id": "t_000001",
     "text_span": "Version 1.0 | March 2026",
     "doc_id": "dd68cea4_sample_graphrag_overview",
     "page_idx": 0,
     "source": "full.md",
     "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_001",
     "char_interval_fullmd": {
      "start_pos": 52,
      "end_pos": 76
     },
     "fullmd_verbatim": "Version 1.0 | March 2026",
     "bbox_normalized": null,
     "table_image": null
    },
    {
     "triple_id": "t_000002",
     "text_span": "LangExtract (v1.1.1) performs structured information extraction from plain text using few-shot prompting with LLM backends (Gemini, OpenAI, or local Ollama)",
     "doc_id": "dd68cea4_sample_graphrag_overview",
     "page_idx": 1,
     "source": "full.md",
     "chunk_id": "dd68cea4_sample_graphrag_overview_chunk_005",
     "char_interval_fullmd": {
      "start_pos": 942,
      "end_pos": 1098
     },
     "fullmd_verbatim": "LangExtract (v1.1.1) performs structured information extraction from plain text using few-shot prompting with LLM backends (Gemini, OpenAI, or local Ollama)",
     "bbox_normalized": null,
     "table_image": null
    },
    {
     "triple_id": "t_000008",
     "text_span": ".pdf",
     "doc_id": "dd68cea4_sample_graphrag_overview",
     "page_idx": 2,
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "fullmd_verbatim": null,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    {
     "triple_id": "t_000009",
     "text_span": "No",
     "doc_id": "dd68cea4_sample_graphrag_overview",
     "page_idx": 2,
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "fullmd_verbatim": null,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    },
    {
     "triple_id": "t_000010",
     "text_span": "pipeline / vlm",
     "doc_id": "dd68cea4_sample_graphrag_overview",
     "page_idx": 2,
     "source": "table_body",
     "chunk_id": null,
     "char_interval_fullmd": null,
     "fullmd_verbatim": null,
     "bbox_normalized": [
      43,
      634,
      880,
      802
     ],
     "table_image": "images/9eaf3d2fef95d8802e9c37876c50fe81d12d59108c4ea85e8e1738ab2d5c7673.jpg"
    }
   ],
   "doc_ids": [
    "dd68cea4_sample_graphrag_overview"
   ],
   "mode": "sse",
   "latency_ms": {
    "total": 8420,
    "retrieval": 6100,
    "answer": 2300
   },
   "error_code": null,
   "created_at": "2026-10-15T03:00:00Z"
  }
 ]
}],
};

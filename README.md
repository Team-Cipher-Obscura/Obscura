# Context Intelligence & Relevance Module

This module is P4 in the browser-agent pipeline.

P4 receives:
- A sanitized browser context from P3
- The current task from P1
- The previous cycle's element state

P4 performs only context filtering.

## P4 Responsibilities

For each element:

1. Calculate task relevance using:
   - element text
   - tag
   - type
   - role
   - task keywords

2. Compare the element with the previous cycle.

3. Keep the element when:

   relevant === true OR changed === true

4. Pass kept elements through unchanged.

P4 does not:
- perform OCR
- detect faces
- scan for PII
- redact content
- modify screenshots
- modify sanitized_regions
- modify sensitive fields

P3 is fully responsible for sanitization.

## Pipeline

P1
│
│ task
▼
"Find Mumbai flight"

P3
│
│ sanitized browser context
▼
P4
│
├── relevance
├── change detection
└── filtering
│
│ relevant OR changed
▼
P5

## Input

P3 provides:

- frame_id
- elements
- sanitized_regions
- screenshot

P1 provides:

- task

## Output

P4 produces:

{
  "frame_id": "...",
  "task": "...",
  "elements": [...],
  "sanitized_regions": [...],
  "screenshot": "..."
}

The elements selected by P4 are passed through without modification.

## Current Implementation

### Relevance

The current implementation uses lightweight keyword overlap and DOM semantics.

### Change Detection

The current implementation compares an element against the previous cycle using:
- text
- tag
- type
- role
- bounding box

New elements are considered changed.

### Filtering

An element is forwarded when:

relevant || changed
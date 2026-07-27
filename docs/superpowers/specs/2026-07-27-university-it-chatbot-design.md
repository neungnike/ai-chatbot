# University IT Support Chatbot — Design

## Purpose

RAG-based chatbot ที่ตอบคำถามการใช้งาน IT ของมหาวิทยาลัย โดยตอบจาก resource
ภายใน (เอกสาร/คู่มือ + ประวัติ ticket) เท่านั้น ห้ามตอบเดา (hallucination) —
ถ้าไม่พบข้อมูลที่เกี่ยวข้องหรือไม่มั่นใจ ให้ตอบว่าไม่ทราบและแนะนำให้ติดต่อ
IT support คน

ผู้ใช้งานเป้าหมาย: นักศึกษา/บุคลากร ประมาณหลักร้อยคน/วัน (pilot scale)

Qwen (ผ่าน API key/curl) จะถูกใช้ทั้งเป็นผู้เขียนโค้ดทั้งหมดของระบบ และเป็น
LLM ที่ตอบคำถามใน production (ผ่าน REST call ธรรมดา ไม่ใช้ framework
agent สำเร็จรูป)

## Non-goals

- ไม่ทำ SSO/login ในเวอร์ชันแรก
- ไม่ทำ auto-sync กับระบบ helpdesk/wiki เดิม (ยังไม่รู้ระบบที่ใช้จริง) —
  เริ่มจาก manual ingestion ผ่านไฟล์ export ก่อน
- ไม่สร้าง ticket อัตโนมัติเมื่อบอทตอบไม่ได้ (แค่แนะนำให้ติดต่อคน)

## Architecture

```
                    ┌─────────────────┐
                    │   RAG Engine     │  (Express.js API, core service)
                    │  - embed query   │
LINE OA Webhook ───▶│  - pgvector      │◀─── Web Chat (standalone page)
                    │    search        │
Web Widget ─────────▶  - Qwen API call │◀─── embed.js (script tag, cross-origin)
(3rd-party sites)   │  - grounding     │
                    │    check         │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ Ingestion CLI     │  (admin tool, manual trigger)
                    │ - parse docs      │
                    │ - chunk + embed   │
                    │ - store pgvector  │
                    └───────────────────┘
```

หลักการ: LINE bot, web page, widget เป็นแค่ "หน้าตา" (channel) ที่เรียก RAG
Engine ตัวเดียวกันผ่าน internal API เดียวกัน ไม่ duplicate logic

Stack: Node.js/TypeScript, PostgreSQL + pgvector (self-hosted), Qwen API
(text generation + text embedding ผ่าน REST/curl)

## Components

### 1. RAG Engine (Express.js API)

- `POST /api/chat` รับ `{message, sessionId, channel}` →
  1. embed query (Qwen embedding API)
  2. pgvector similarity search (top-k chunks)
  3. ถ้า similarity score ต่ำกว่า threshold ที่กำหนด → ข้าม Qwen, ตอบ
     "ไม่ทราบ กรุณาติดต่อ IT support" ทันที
  4. ถ้ามี context เพียงพอ → ส่ง context + question ไปยัง Qwen chat API →
     คืนคำตอบพร้อม citation (อ้างอิงเอกสารต้นทาง)
- เก็บ log `retrieved_chunk_ids` ทุกข้อความเพื่อ trace ย้อนหลังได้ว่าคำตอบ
  มาจากเอกสารไหน
- CORS: allowlist โดเมนที่อนุญาตให้ฝัง widget ได้ (config-based, เพิ่มโดเมน
  ใหม่ได้ภายหลัง)

### 2. Ingestion CLI (Node script, รันด้วยมือโดยแอดมิน)

- คำสั่ง `ingest <file>` รองรับ PDF/Word/CSV/plain text (export จากระบบ
  helpdesk/wiki เดิม)
- Chunk เอกสาร (~500 token/chunk, มี overlap) → เรียก Qwen embedding API →
  เก็บลง pgvector พร้อม metadata (แหล่งที่มา, วันที่อัปโหลด)
- ไฟล์ที่ parse ไม่ได้ → แจ้ง error พร้อมชื่อไฟล์ ไม่ทำให้ batch อื่นหยุด

### 3. LINE OA Bot

- `POST /webhook/line` รับ event จาก LINE Messaging API → เรียก RAG Engine
  ภายใน (`/api/chat` แบบ internal call) → reply ผ่าน LINE reply API
- เก็บ conversation สั้นๆ ต่อ userId เพื่อบริบทคำถามต่อเนื่อง (ไม่เก็บถาวร)

### 4. Web Chat Page + Embeddable Widget

- Standalone page: หน้า chat เต็มหน้าจอ เรียก `/api/chat` ตรงๆ ไม่ต้อง login
- Widget: ไฟล์ `widget.js` ตัวเดียว ฝัง `<script>` ในเว็บไซต์ภายนอกได้
  (คณะ/หน่วยงานต่างๆ ของมหาวิทยาลัย) — render เป็น floating chat bubble
  ผ่าน iframe เพื่อกัน CSS ของเว็บแม่รบกวน เรียก RAG Engine เดียวกันแบบ
  cross-origin (ผ่าน CORS allowlist)
- ไม่มี login — session ผูกกับ browser (localStorage) ชั่วคราว

## Data Model (PostgreSQL + pgvector)

```
documents        (id, source_type, source_name, uploaded_at)
chunks           (id, document_id, content, embedding vector, metadata jsonb)
chat_sessions    (id, channel[line|web|widget], external_user_id, created_at)
chat_messages    (id, session_id, role, content, retrieved_chunk_ids, created_at)
```

## Error Handling

- Qwen API timeout/error → retry 1 ครั้ง → ยังพัง → ตอบ "ระบบขัดข้องชั่วคราว
  กรุณาลองใหม่ หรือติดต่อ IT support"
- Retrieval ว่างเปล่า (ไม่พบเอกสารเกี่ยวข้อง) → ตอบไม่ทราบทันที ไม่เรียก
  Qwen chat API (ประหยัด cost + กัน hallucination)
- Ingestion parse ไฟล์ล้มเหลว → log error พร้อมชื่อไฟล์ ไม่หยุด batch อื่น

## Testing Strategy

- Unit test: chunking logic, grounding-threshold logic (mock embeddings)
- Integration test: ingest ไฟล์ตัวอย่าง → ยิงคำถามผ่าน `/api/chat` → เช็ค
  citation ตรงกับ chunk ที่ใส่ไป
- Manual QA: ชุดคำถาม IT จริง (เช่น "wifi เชื่อมต่อไม่ได้",
  "ลืมรหัสผ่าน email") ทดสอบผ่านทั้ง LINE, web page, widget

## Open Questions / Future Work

- ระบบ helpdesk/wiki เดิมที่ใช้จริงยังไม่ทราบแน่ชัด — ต้องสำรวจก่อน
  implementation เพื่อยืนยันรูปแบบไฟล์ export ที่ ingestion CLI ต้องรองรับ
- ความถี่การอัปเดตเอกสารยังไม่ชัดเจน — เริ่มจาก manual ingestion, พิจารณา
  auto-sync ภายหลังหากจำเป็น

# Ground Truth: Persona dalam System Prompt — Adakah Ia Merosakkan Prestasi?

## Soalan Kajian
Adakah meletakkan persona ("You are SubMaker, an expert...") dalam System Instruction meningkatkan atau merosakkan prestasi model?

## Verdict Ringkas
**KAU BETUL. Persona role-play TIDAK meningkatkan prestasi pada objective tasks — kajian peer-reviewed mengesahkan ia neutral atau NEGATIF.**

---

## Bukti Kajian Akademik

### 1. Kajian Utama: Zheng et al. 2024 (arXiv:2311.10054v3)
**"When 'A Helpful Assistant' Is Not Really Helpful: Personas in System Prompts Do Not Improve Performances of Large Language Models"**
- Penulis: Carnegie Mellon, Stanford, LG AI Research, University of Michigan
- Skala: **162 personas × 2,410 soalan MMLU × 9 model** (Llama-3, Mistral, Qwen2.5, FLAN-T5)
- Kaedah: mixed-effects regression dengan random effect per model

**Penemuan utama:**
1. *"prompting with personas has no or small negative effects on model performance compared with the control setting where no persona is added"*
2. *"none of the personas lead to statistically better model performance"*
3. *"certain personas may actually lead to lower performance"* — contoh: persona "ecologist" merosakkan prestasi Mistral
4. Untuk Llama3-70B (model besar): **lebih banyak personas ada kesan NEGATIF** — scaling effect terbalik
5. *"adding a persona does not necessarily improve an LLM's performance on objective tasks. On the contrary, it might actually hurt the models' overall performance in some situations"*
6. Domain alignment (persona dalam bidang yang sama dengan soalan) cuma beri kesan kecil (coefficient 0.004)
7. Mekanisme: persona effect **"largely random"** — pilihan persona terbaik tak boleh diramal, strategy pilihan automatik tak lebih baik dari random

### 2. Jekyll & Hyde (arXiv:2408.08631)
**"Persona is a Double-edged Sword"**
- Role-playing prompts **mengganggu dan merosakkan reasoning dalam 4 daripada 12 dataset** — termasuk dengan GPT-4
- Statistik: persona betul membantu 15.75% kes, tapi persona menyebabkan jawapan SALAH dalam 13.78% kes yang tanpa persona akan betul
- Contoh klasik: soalan matematik, model terjebak persona "civil engineer" dan jawab salah

### 3. Expert Personas (arXiv:2603.18507)
**"Expert Personas Improve LLM Alignment but Damage Accuracy"**
- Tajuk sendiri sudah menjelaskan: expert persona memperbaiki *alignment* tetapi **merosakkan ketepatan**

### 4. Persona Solver (arXiv:2408.08631v2)
Kajian khusus tentang mitigasi kesan negatif role-playing prompts dalam zero-shot reasoning.

### 5. Nuans penting (kajian yang supporting role-play)
- Kong et al. (arXiv:2308.07702) "Better Zero-Shot Reasoning with Role-Play Prompting" — mendapat penambahbaikan, TETAPI ini untuk reasoning task umum, bukan factual QA; dan kajian Jekyll & Hyde menunjukkan keputusan tidak konsisten cross-dataset
- Role-playing memang berguna BILA objektifnya ialah role-play itu sendiri (chatbot karakter, simulasi) — bukan untuk precision task

---

## Aplikasi kepada SubMaker

### Apa yang kajian kata tentang kes kita:
1. **"You are SubMaker, an expert subtitle localization engine"** = speaker-specific persona. Kajian Zheng et al.: speaker-specific prompts lebih BURUK daripada audience-specific, dan kedua-duanya tak mengalahkan no-persona control.
2. Task kita adalah **objective precision task** (penterjemahan berstruktur dengan enforcement format) — kategori tepat di mana persona tak memberi manfaat dan kadangkala merosakkan.
3. **A/B test real-world kau**: tanpa persona → hasil "lebih gempak". Konsisten dengan data akademik.

### Kenapa mazhab Google tetap cakap "define persona"?
Bahasa dokumentasi Google: *"Defining a persona or role (for a chatbot, for example)"* — contohnya chatbot. Untuk task pipeline seperti SubMaker, Google's own Gemini 3 guidance sebenarnya menekankan: **"Be precise and direct"** dan **"Place behavioral constraints... in the System Instruction"** — behavioral constraints ≠ persona. Role ≠ behavioral constraint.

Aku tersilap menganggap "persona" (siapa awak) sama dengan "task definition" (apa tugas awak). Kajian menunjukkan yang penting ialah **task definition dan constraints**, bukan identity role-play.

---

## Cadangan Pindaan (v1.5.6) — Persona-Free System Instruction

### Sebelum (v1.5.3 — ada persona):
```
You are SubMaker, an expert subtitle localization engine. Your job is to translate...
```

### Selepas (persona-free, task-defined):
```
Translate subtitle dialogue from {source} into {target}, preserving timing, structure, and formatting.

CORE BEHAVIOR:
- Translate each <s id="N"> slot independently. Never merge, split, reorder, or drop slots.
- Preserve all [br] line-break markers, inline tags (<i>, <b>), speaker dashes, and music notes exactly where they appear.
- Preserve numbers, dates, times, measurements, and proper nouns accurately.
- Keep titles of creative works, brand names, and legal entities verbatim in their original language.
- Use natural spoken dialogue phrasing: never mirror foreign syntax or trailing modifiers; never use formal copulas, formal conjunctions, or dictionary jargon; never use literal pronoun calques. Rephrase each line as authentic conversational speech with natural connectors and question particles.
- Preserve grammatically incomplete clauses as incomplete to maintain subtitle synchronization.
- Do not add explanations, notes, markdown fences, or thinking blocks.

OUTPUT FORMAT:
- Return only raw <s id="N">...</s> tags.
- Output exactly as many tags as the input batch contains, with identical IDs in identical order.
- Emit only the inner text of the first pre-filled slot at the very first character; do not repeat the opening tag.

LANGUAGE-SPECIFIC:
- For Malay (ms/my/mya/zsm): use Bahasa Melayu Malaysia register. Common English loanwords used in daily Malaysian speech (e.g., okay, confirm, check, settle, try, call, parking, boss) are acceptable. Avoid Indonesianisms (bisa, banget, gimana, cewek/cowok, kalian, ngomong, kok, dong, sih). Choose self-reference by context: saya/awak default, aku/kau intimate, saya/anda formal.

SAFETY FALLBACK:
- If a line contains sensitive, profane, or mature content, translate it with an objective, non-glorified equivalent. Do not refuse the task or omit the slot.
```

### Nota reka bentuk:
1. **Buang persona** — task-defined instruction sahaja
2. **Restore direktif style terperinci dari backup** (anti-pattern list: copulas, jargon, pronoun calques, trailing modifiers, incomplete clauses) — menangani aduan "ayat tak hidup" tanpa persona
3. **Tiada "Your job is to" self-reference** — terus arahan
4. `<task>` dalam user prompt kekal ringkas kerana style rules kini penuh dalam SI

---

## Rujukan
- Zheng, Pei, Logeswaran, Lee, Jurgens (2024). *When "A Helpful Assistant" Is Not Really Helpful: Personas in System Prompts Do Not Improve Performances of Large Language Models*. arXiv:2311.10054v3. https://arxiv.org/html/2311.10054v3
- Kong et al. (2023). *Better Zero-Shot Reasoning with Role-Play Prompting*. arXiv:2308.07702
- *Persona is a Double-edged Sword: Enhancing the Zero-shot Reasoning by Ensembling the Role-playing and Neutral Prompts*. arXiv:2408.08631
- *Expert Personas Improve LLM Alignment but Damage Accuracy*. arXiv:2603.18507
- Google AI. *Prompt design strategies*. https://ai.google.dev/gemini-api/docs/prompting-strategies

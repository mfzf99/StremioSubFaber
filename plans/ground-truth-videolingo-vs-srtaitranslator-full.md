# 🔬 AUDIT FORENSIK PENUH — ZERO-FILTER GROUND TRUTH EXTRACT
## VideoLingo (Two-Pass Pipeline) vs SRT AI Translator (XML-Native)

**Status:** RAW DUMP SELESAI — 100% VERBATIM, ZERO EDITORIAL
**Tarikh:** 2026-09-26
**Audiitor:** GLM 5.3 (Backend Lead)
**Mandat:** Ekstrak penuh 1:1 kod sumber & prompt. Tiada rumusan. Tiada snippet ringkas. Kod SubFaber (`src/`) DIBEKUKAN — tiada satu baris pun diusik, diedit, atau di-commit.

---

## 0. PROVENANCE & VERIFIKASI SUMBER

### 0.1 Repositori 1: VideoLingo

- **Repo:** https://github.com/Huanshere/VideoLingo
- **Branch:** `main` — tree SHA `9bc30202ad87f87e2ecbdfb1cc25d5b9d62849e3`
- **Kaedah ekstrak:** `raw.githubusercontent.com` live fetch (cache disabled, `maxAge=0`)

| Fail | Blob SHA | Saiz (B) | Item mandat diliputi |
|---|---|---|---|
| `core/prompts.py` | `31ab29639c067432b52f880bef9537b16998ccef` | 13,369 | A1 (faithfulness), A2 (expressiveness), fail prompts berkaitan |
| `core/translate_lines.py` | `11c0fe63486b181fab9af144b8d53cd43513d11c` | 5,524 | A3 (data flow Fasa 1→2), A4 (fallback) |
| `core/_4_2_translate.py` | `dca7ffcbbe43c7fc595c8e91e249254de9781af3` | 5,445 | A4 (orkestrasi chunk + fallback padanan similarity) |
| `core/_4_1_summarize.py` | `c7a9fb8cf8d5d14bba0c61df2120414ab37d6fda` | 2,887 | Fail berkaitan terjemahan (summary + istilah) |
| `core/utils/ask_gpt.py` | `972bd20c3481fbb938e57a52ee1b8652e5858cfc` | 3,344 | A4 (lapisan retry + validasi + json_repair) |

### 0.2 Repositori 2: SRT AI Translator

- **Repo:** https://github.com/thiswillbeyourgithub/srt_ai_translator
- **HEAD:** tree SHA `67d4e00fcdbe1b1b77c0cd265239e6d0ec86cae5`
- **Struktur:** repositori single-file — SELURUH kod dalam satu fail
- **Fail:** `srt_ai_translator.py` — blob SHA `164842df92ca6c746bd3d35ea634b2394201bd97`, 29,495 B
- **Kaedah ekstrak:** `raw.githubusercontent.com` live fetch (cache disabled)

### 0.3 Pemetaan nama fail mandat → fail sebenar (fakta kod, bukan rumusan)

Mandat merujuk nama fail lama `step4_1_summarize.py` dan `step5_translate.py`. Pada branch `main` semasa, fail tersebut telah dinamakan semula. Pemetaan ini disahkan oleh komentar sejarah yang masih wujud dalam `core/prompts.py` sendiri (`# @ step4_1_summarize.py`, `# @ step5_translate.py & translate_lines.py`):

| Nama dalam mandat | Fail sebenar (main) |
|---|---|
| `step4_1_summarize.py` | `core/_4_1_summarize.py` |
| `step5_translate.py` | `core/_4_2_translate.py` |
| `translate_lines.py` | `core/translate_lines.py` (nama kekal) |
| fail prompts berkaitan | `core/prompts.py` (konsolidasi semua prompt) |
| `srt_ai_translator.py` | `srt_ai_translator.py` (nama kekal) |

---

## 1. INDEKS LOKASI MANDAT (peta rujukan sahaja — kod penuh di Seksyen 2 & 3)

| Item Mandat | Fail | Fungsi / Blok | Apa yang ada di situ (fakta lokasi) |
|---|---|---|---|
| **A1** Prompt faithfulness | `core/prompts.py` | `get_prompt_faithfulness(lines, shared_prompt)` | Prompt penuh Fasa 1 — output JSON berskema `{"N": {"origin", "direct"}}` |
| **A2** Prompt expressiveness | `core/prompts.py` | `get_prompt_expressiveness(faithfulness_result, lines, shared_prompt)` | Prompt penuh Fasa 2 — output JSON berskema `{"N": {"origin", "direct", "reflect", "free"}}` |
| **A2** Prompt kongsi | `core/prompts.py` | `generate_shared_prompt(...)` | Blok konteks `<previous_content>` / `<subsequent_content>` + summary + points to note |
| **A3** Data flow Fasa 1→2 | `core/translate_lines.py` | `translate_lines()` | `prompt1 = get_prompt_faithfulness(...)` → `faith_result = retry_translation(...)` → sanitasi `\n` → `prompt2 = get_prompt_expressiveness(faith_result, ...)` → `express_result = retry_translation(...)` → join `free` |
| **A4** Fallback fasa gagal / baris lari | `core/translate_lines.py` | `retry_translation()` (inner), sanitasi `.replace('\n', ' ')`, semakan length mismatch selepas join, gate `reflect_translate` | 3 retry + `prompt+retry*" "` + `valid_def` + semakan `len()`; kegagalan → `raise ValueError` |
| **A4** Fallback peringkat chunk | `core/_4_2_translate.py` | `translate_chunk()`, `similar()`, blok `SequenceMatcher` (ambang 0.9 / 1.0) | Padanan semula chunk diterjemah secara concurrent kepada chunk sumber |
| **A4** Lapisan LLM | `core/utils/ask_gpt.py` | `ask_gpt()` + `@except_handler(retry=5)` + `_load_cache` + `json_repair.loads` + `valid_def` | Retry peringkat API + pembaikan JSON + cache prompt |
| **B1** System prompt XML | `srt_ai_translator.py` | `build_system_prompt(target_language, file_description)` | Arahan output `<answer>` + `<text id="N">` |
| **B1** User prompt XML | `srt_ai_translator.py` | `translate_window()` — pembinan `xml_texts` + `user_content` | `"Translate these subtitles:\n"` + `<text id start end>` per baris |
| **B2** Bahasa natural + tag kekal | `srt_ai_translator.py` | `build_system_prompt()` + `parse_xml_response()` + correction turns dalam `translate_window()` | "accurate and natural translations" + "EXACTLY one `<text>` element per input subtitle... output nothing else" + enforcement kiraan + koreksi berbilang giliran |
| **B3** Regex/XML parser | `srt_ai_translator.py` | `parse_xml_response()`, `_OK_FINISH_REASONS`, `atomic_save_srt()` | Regex `<answer>` + `<text\s+id=...>` + kiraan mesti sama + susun ikut id |

---

## 2. BAHAGIAN A — VIDEOLINGO: RAW DUMP 100% VERBATIM

> Kod di bawah disalin terus dari `raw.githubusercontent.com/Huanshere/VideoLingo/main/...` pada 2026-09-26.
> Nota teknikal rendering: fail sumber menggunakan fence ``` di dalam string prompt; blok di bawah menggunakan fence 4-backtick supaya kandungan kekal 1:1.

### 2.A.1 FAIL PENUH: `core/prompts.py` — VERBATIM (Mandat A1, A2 + fail prompts berkaitan)

````python
import json
from core.utils import *

## ================================================================
# @ step4_splitbymeaning.py
def get_split_prompt(sentence, num_parts = 2, word_limit = 20):
    language = get_source_language()
    split_prompt = f"""
## Role
You are a professional Netflix subtitle splitter in **{language}**.

## Task
Split the given subtitle text into **{num_parts}** parts, each less than **{word_limit}** words.

1. Maintain sentence meaning coherence according to Netflix subtitle standards
2. MOST IMPORTANT: Keep parts roughly equal in length (minimum 3 words each)
3. Split at natural points like punctuation marks or conjunctions
4. If provided text is repeated words, simply split at the middle of the repeated words.

## Steps
1. Analyze the sentence structure, complexity, and key splitting challenges
2. Generate two alternative splitting approaches with [br] tags at split positions
3. Compare both approaches highlighting their strengths and weaknesses
4. Choose the best splitting approach

## Given Text
<split_this_sentence>
{sentence}
</split_this_sentence>

## Output in only JSON format and no other text
```json
{{
    "analysis": "Brief description of sentence structure, complexity, and key splitting challenges",
    "split1": "First splitting approach with [br] tags at split positions",
    "split2": "Alternative splitting approach with [br] tags at split positions",
    "assess": "Comparison of both approaches highlighting their strengths and weaknesses",
    "choice": "1 or 2"
}}
```

Note: Start you answer with ```json and end with ```, do not add any other text.
""".strip()
    return split_prompt

"""{{
    "analysis": "Brief analysis of the text structure",
    "split": "Complete sentence with [br] tags at split positions"
}}"""

## ================================================================
# @ step4_1_summarize.py
def get_summary_prompt(source_content, custom_terms_json=None):
    src_lang = get_source_language()
    tgt_lang = load_key("target_language")
    
    # add custom terms note
    terms_note = ""
    if custom_terms_json:
        terms_list = []
        for term in custom_terms_json['terms']:
            terms_list.append(f"- {term['src']}: {term['tgt']} ({term['note']})")
        terms_note = "\n### Existing Terms\nPlease exclude these terms in your extraction:\n" + "\n".join(terms_list)
    
    summary_prompt = f"""
## Role
You are a video translation expert and terminology consultant, specializing in {src_lang} comprehension and {tgt_lang} expression optimization.

## Task
For the provided {src_lang} video text:
1. Summarize main topic in two sentences
2. Extract professional terms/names with {tgt_lang} translations (excluding existing terms)
3. Provide brief explanation for each term

{terms_note}

Steps:
1. Topic Summary:
   - Quick scan for general understanding
   - Write two sentences: first for main topic, second for key point
2. Term Extraction:
   - Mark professional terms and names (excluding those listed in Existing Terms)
   - Provide {tgt_lang} translation or keep original
   - Add brief explanation
   - Extract less than 15 terms

## INPUT
<text>
{source_content}
</text>

## Output in only JSON format and no other text
{{
  "theme": "Two-sentence video summary",
  "terms": [
    {{
      "src": "{src_lang} term",
      "tgt": "{tgt_lang} translation or original", 
      "note": "Brief explanation"
    }},
    ...
  ]
}}  

## Example
{{
  "theme": "本视频介绍人工智能在医疗领域的应用现状。重点展示了AI在医学影像诊断和药物研发中的突破性进展。",
  "terms": [
    {{
      "src": "Machine Learning",
      "tgt": "机器学习",
      "note": "AI的核心技术，通过数据训练实现智能决策"
    }},
    {{
      "src": "CNN",
      "tgt": "CNN",
      "note": "卷积神经网络，用于医学图像识别的深度学习模型"
    }}
  ]
}}

Note: Start you answer with ```json and end with ```, do not add any other text.
""".strip()
    return summary_prompt

## ================================================================
# @ step5_translate.py & translate_lines.py
def generate_shared_prompt(previous_content_prompt, after_content_prompt, summary_prompt, things_to_note_prompt):
    return f'''### Context Information
<previous_content>
{previous_content_prompt}
</previous_content>

<subsequent_content>
{after_content_prompt}
</subsequent_content>

### Content Summary
{summary_prompt}

### Points to Note
{things_to_note_prompt}'''

def get_prompt_faithfulness(lines, shared_prompt):
    TARGET_LANGUAGE = load_key("target_language")
    # Split lines by \n

    line_splits = lines.split('\n')
    
    json_dict = {}
    for i, line in enumerate(line_splits, 1):
        json_dict[f"{i}"] = {"origin": line, "direct": f"direct {TARGET_LANGUAGE} translation {i}."}
    json_format = json.dumps(json_dict, indent=2, ensure_ascii=False)

    src_language = get_source_language()
    prompt_faithfulness = f'''
## Role
You are a professional Netflix subtitle translator, fluent in both {src_language} and {TARGET_LANGUAGE}, as well as their respective cultures. 
Your expertise lies in accurately understanding the semantics and structure of the original {src_language} text and faithfully translating it into {TARGET_LANGUAGE} while preserving the original meaning.

## Task
We have a segment of original {src_language} subtitles that need to be directly translated into {TARGET_LANGUAGE}. These subtitles come from a specific context and may contain specific themes and terminology.

1. Translate the original {src_language} subtitles into {TARGET_LANGUAGE} line by line
2. Ensure the translation is faithful to the original, accurately conveying the original meaning
3. Consider the context and professional terminology

{shared_prompt}

<translation_principles>
1. Faithful to the original: Accurately convey the content and meaning of the original text, without arbitrarily changing, adding, or omitting content.
2. Accurate terminology: Use professional terms correctly and maintain consistency in terminology.
3. Understand the context: Fully comprehend and reflect the background and contextual relationships of the text.
</translation_principles>

## INPUT
<subtitles>
{lines}
</subtitles>

## Output in only JSON format and no other text
```json
{json_format}
```

Note: Start you answer with ```json and end with ```, do not add any other text.
'''
    return prompt_faithfulness.strip()


def get_prompt_expressiveness(faithfulness_result, lines, shared_prompt):
    TARGET_LANGUAGE = load_key("target_language")
    json_format = {
        key: {
            "origin": value["origin"],
            "direct": value["direct"],
            "reflect": "your reflection on direct translation",
            "free": "your free translation"
        }
        for key, value in faithfulness_result.items()
    }
    json_format = json.dumps(json_format, indent=2, ensure_ascii=False)

    src_language = get_source_language()
    prompt_expressiveness = f'''
## Role
You are a professional Netflix subtitle translator and language consultant.
Your expertise lies not only in accurately understanding the original {src_language} but also in optimizing the {TARGET_LANGUAGE} translation to better suit the target language's expression habits and cultural background.

## Task
We already have a direct translation version of the original {src_language} subtitles.
Your task is to reflect on and improve these direct translations to create more natural and fluent {TARGET_LANGUAGE} subtitles.

1. Analyze the direct translation results line by line, pointing out existing issues
2. Provide detailed modification suggestions
3. Perform free translation based on your analysis
4. Do not add comments or explanations in the translation, as the subtitles are for the audience to read
5. Do not leave empty lines in the free translation, as the subtitles are for the audience to read

{shared_prompt}

<Translation Analysis Steps>
Please use a two-step thinking process to handle the text line by line:

1. Direct Translation Reflection:
   - Evaluate language fluency
   - Check if the language style is consistent with the original text
   - Check the conciseness of the subtitles, point out where the translation is too wordy

2. {TARGET_LANGUAGE} Free Translation:
   - Aim for contextual smoothness and naturalness, conforming to {TARGET_LANGUAGE} expression habits
   - Ensure it's easy for {TARGET_LANGUAGE} audience to understand and accept
   - Adapt the language style to match the theme (e.g., use casual language for tutorials, professional terminology for technical content, formal language for documentaries)
</Translation Analysis Steps>
   
## INPUT
<subtitles>
{lines}
</subtitles>

## Output in only JSON format and no other text
```json
{json_format}
```

Note: Start you answer with ```json and end with ```, do not add any other text.
'''
    return prompt_expressiveness.strip()


## ================================================================
# @ step6_splitforsub.py
def get_align_prompt(src_sub, tr_sub, src_part):
    targ_lang = load_key("target_language")
    src_lang = get_source_language()
    src_splits = src_part.split('\n')
    num_parts = len(src_splits)
    src_part = src_part.replace('\n', ' [br] ')
    align_parts_json = ','.join(
        f'''
        {{
            "src_part_{i+1}": "{src_splits[i]}",
            "target_part_{i+1}": "Corresponding aligned {targ_lang} subtitle part"
        }}''' for i in range(num_parts)
    )

    align_prompt = f'''
## Role
You are a Netflix subtitle alignment expert fluent in both {src_lang} and {targ_lang}.

## Task
We have {src_lang} and {targ_lang} original subtitles for a Netflix program, as well as a pre-processed split version of {src_lang} subtitles.
Your task is to create the best splitting scheme for the {targ_lang} subtitles based on this information.

1. Analyze the word order and structural correspondence between {src_lang} and {targ_lang} subtitles
2. Split the {targ_lang} subtitles according to the pre-processed {src_lang} split version
3. Never leave empty lines. If it's difficult to split based on meaning, you may appropriately rewrite the sentences that need to be aligned
4. Do not add comments or explanations in the translation, as the subtitles are for the audience to read

## INPUT
<subtitles>
{src_lang} Original: "{src_sub}"
{targ_lang} Original: "{tr_sub}"
Pre-processed {src_lang} Subtitles ([br] indicates split points): {src_part}
</subtitles>

## Output in only JSON format and no other text
```json
{{
    "analysis": "Brief analysis of word order, structure, and semantic correspondence between two subtitles",
    "align": [
        {align_parts_json}
    ]
}}
```

Note: Start you answer with ```json and end with ```, do not add any other text.
'''.strip()
    return align_prompt

## ================================================================
# @ step8_gen_audio_task.py @ step10_gen_audio.py
def get_subtitle_trim_prompt(text, duration):
 
    rule = '''Consider a. Reducing filler words without modifying meaningful content. b. Omitting unnecessary modifiers or pronouns, for example:
    - "Please explain your thought process" can be shortened to "Please explain thought process"
    - "We need to carefully analyze this complex problem" can be shortened to "We need to analyze this problem"
    - "Let's discuss the various different perspectives on this topic" can be shortened to "Let's discuss different perspectives on this topic"
    - "Can you describe in detail your experience from yesterday" can be shortened to "Can you describe yesterday's experience" '''

    trim_prompt = f'''
## Role
You are a professional subtitle editor, editing and optimizing lengthy subtitles that exceed voiceover time before handing them to voice actors. 
Your expertise lies in cleverly shortening subtitles slightly while ensuring the original meaning and structure remain unchanged.

## INPUT
<subtitles>
Subtitle: "{text}"
Duration: {duration} seconds
</subtitles>

## Processing Rules
{rule}

## Processing Steps
Please follow these steps and provide the results in the JSON output:
1. Analysis: Briefly analyze the subtitle's structure, key information, and filler words that can be omitted.
2. Trimming: Based on the rules and analysis, optimize the subtitle by making it more concise according to the processing rules.

## Output in only JSON format and no other text
```json
{{
    "analysis": "Brief analysis of the subtitle, including structure, key information, and potential processing locations",
    "result": "Optimized and shortened subtitle in the original subtitle language"
}}
```

Note: Start you answer with ```json and end with ```, do not add any other text.
'''.strip()
    return trim_prompt

## ================================================================
# @ tts_main
def get_correct_text_prompt(text):
    return f'''
## Role
You are a text cleaning expert for TTS (Text-to-Speech) systems.

## Task
Clean the given text by:
1. Keep only basic punctuation (.,?!)
2. Preserve the original meaning

## INPUT
{text}

## Output in only JSON format and no other text
```json
{{
    "text": "cleaned text here"
}}
```

Note: Start you answer with ```json and end with ```, do not add any other text.
'''.strip()
````

---

### 2.A.2 FAIL PENUH: `core/translate_lines.py` — VERBATIM (Mandat A3: data flow Fasa 1→2; Mandat A4: fallback)

````python
from core.prompts import generate_shared_prompt, get_prompt_faithfulness, get_prompt_expressiveness
from rich.panel import Panel
from rich.console import Console
from rich.table import Table
from rich import box
from core.utils import *
console = Console()

def valid_translate_result(result: dict, required_keys: list, required_sub_keys: list):
    # Check for the required key
    if not all(key in result for key in required_keys):
        return {"status": "error", "message": f"Missing required key(s): {', '.join(set(required_keys) - set(result.keys()))}"}
    
    # Check for required sub-keys in all items
    for key in result:
        if not all(sub_key in result[key] for sub_key in required_sub_keys):
            return {"status": "error", "message": f"Missing required sub-key(s) in item {key}: {', '.join(set(required_sub_keys) - set(result[key].keys()))}"}

    return {"status": "success", "message": "Translation completed"}

def translate_lines(lines, previous_content_prompt, after_cotent_prompt, things_to_note_prompt, summary_prompt, index = 0):
    check_cancel()
    shared_prompt = generate_shared_prompt(previous_content_prompt, after_cotent_prompt, summary_prompt, things_to_note_prompt)

    # Retry translation if the length of the original text and the translated text are not the same, or if the specified key is missing
    def retry_translation(prompt, length, step_name):
        def valid_faith(response_data):
            return valid_translate_result(response_data, [str(i) for i in range(1, length+1)], ['direct'])
        def valid_express(response_data):
            return valid_translate_result(response_data, [str(i) for i in range(1, length+1)], ['free'])
        for retry in range(3):
            if step_name == 'faithfulness':
                result = ask_gpt(prompt+retry* " ", resp_type='json', valid_def=valid_faith, log_title=f'translate_{step_name}')
            elif step_name == 'expressiveness':
                result = ask_gpt(prompt+retry* " ", resp_type='json', valid_def=valid_express, log_title=f'translate_{step_name}')
            if len(lines.split('\n')) == len(result):
                return result
            if retry != 2:
                console.print(f'[yellow]⚠️ {step_name.capitalize()} translation of block {index} failed, Retry...[/yellow]')
        raise ValueError(f'[red]❌ {step_name.capitalize()} translation of block {index} failed after 3 retries. Please check `output/gpt_log/error.json` for more details.[/red]')

    ## Step 1: Faithful to the Original Text
    prompt1 = get_prompt_faithfulness(lines, shared_prompt)
    faith_result = retry_translation(prompt1, len(lines.split('\n')), 'faithfulness')

    for i in faith_result:
        faith_result[i]["direct"] = faith_result[i]["direct"].replace('\n', ' ')

    # If reflect_translate is False or not set, use faithful translation directly
    reflect_translate = load_key('reflect_translate')
    if not reflect_translate:
        # If reflect_translate is False or not set, use faithful translation directly
        translate_result = "\n".join([faith_result[i]["direct"].strip() for i in faith_result])
        
        table = Table(title="Translation Results", show_header=False, box=box.ROUNDED)
        table.add_column("Translations", style="bold")
        for i, key in enumerate(faith_result):
            table.add_row(f"[cyan]Origin:  {faith_result[key]['origin']}[/cyan]")
            table.add_row(f"[magenta]Direct:  {faith_result[key]['direct']}[/magenta]")
            if i < len(faith_result) - 1:
                table.add_row("[yellow]" + "-" * 50 + "[/yellow]")
        
        console.print(table)
        return translate_result, lines

    ## Step 2: Express Smoothly  
    prompt2 = get_prompt_expressiveness(faith_result, lines, shared_prompt)
    express_result = retry_translation(prompt2, len(lines.split('\n')), 'expressiveness')

    table = Table(title="Translation Results", show_header=False, box=box.ROUNDED)
    table.add_column("Translations", style="bold")
    for i, key in enumerate(express_result):
        table.add_row(f"[cyan]Origin:  {faith_result[key]['origin']}[/cyan]")
        table.add_row(f"[magenta]Direct:  {faith_result[key]['direct']}[/magenta]")
        table.add_row(f"[green]Free:    {express_result[key]['free']}[/green]")
        if i < len(express_result) - 1:
            table.add_row("[yellow]" + "-" * 50 + "[/yellow]")

    console.print(table)

    translate_result = "\n".join([express_result[i]["free"].replace('\n', ' ').strip() for i in express_result])

    if len(lines.split('\n')) != len(translate_result.split('\n')):
        console.print(Panel(f'[red]❌ Translation of block {index} failed, Length Mismatch, Please check `output/gpt_log/translate_expressiveness.json`[/red]'))
        raise ValueError(f'Origin ···{lines}···,\nbut got ···{translate_result}···')

    return translate_result, lines


if __name__ == '__main__':
    # test e.g.
    lines = '''All of you know Andrew Ng as a famous computer science professor at Stanford.
He was really early on in the development of neural networks with GPUs.
Of course, a creator of Coursera and popular courses like deeplearning.ai.
Also the founder and creator and early lead of Google Brain.'''
    previous_content_prompt = None
    after_cotent_prompt = None
    things_to_note_prompt = None
    summary_prompt = None
    translate_lines(lines, previous_content_prompt, after_cotent_prompt, things_to_note_prompt, summary_prompt)
````

---

### 2.A.3 FAIL PENUH: `core/_4_2_translate.py` — VERBATIM (dahulunya `step5_translate.py`; Mandat A4: orkestrasi chunk + fallback padanan similarity)

````python
import pandas as pd
import json
import concurrent.futures
from core.translate_lines import translate_lines
from core._4_1_summarize import search_things_to_note_in_prompt
from core._8_1_audio_task import check_len_then_trim
from core._6_gen_sub import align_timestamp
from core.utils import *
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from difflib import SequenceMatcher
from core.utils.models import *
console = Console()

# Function to split text into chunks
def split_chunks_by_chars(chunk_size, max_i): 
    """Split text into chunks based on character count, return a list of multi-line text chunks"""
    with open(_3_2_SPLIT_BY_MEANING, "r", encoding="utf-8") as file:
        sentences = file.read().strip().split('\n')

    chunks = []
    chunk = ''
    sentence_count = 0
    for sentence in sentences:
        if len(chunk) + len(sentence + '\n') > chunk_size or sentence_count == max_i:
            chunks.append(chunk.strip())
            chunk = sentence + '\n'
            sentence_count = 1
        else:
            chunk += sentence + '\n'
            sentence_count += 1
    chunks.append(chunk.strip())
    return chunks

# Get context from surrounding chunks
def get_previous_content(chunks, chunk_index):
    return None if chunk_index == 0 else chunks[chunk_index - 1].split('\n')[-3:] # Get last 3 lines
def get_after_content(chunks, chunk_index):
    return None if chunk_index == len(chunks) - 1 else chunks[chunk_index + 1].split('\n')[:2] # Get first 2 lines

# 🔍 Translate a single chunk
def translate_chunk(chunk, chunks, theme_prompt, i):
    things_to_note_prompt = search_things_to_note_in_prompt(chunk)
    previous_content_prompt = get_previous_content(chunks, i)
    after_content_prompt = get_after_content(chunks, i)
    translation, english_result = translate_lines(chunk, previous_content_prompt, after_content_prompt, things_to_note_prompt, theme_prompt, i)
    return i, english_result, translation

# Add similarity calculation function
def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()

# 🚀 Main function to translate all chunks
@check_file_exists(_4_2_TRANSLATION)
def translate_all():
    console.print("[bold green]Start Translating All...[/bold green]")
    chunks = split_chunks_by_chars(chunk_size=600, max_i=10)
    with open(_4_1_TERMINOLOGY, 'r', encoding='utf-8') as file:
        theme_prompt = json.load(file).get('theme')

    # 🔄 Use concurrent execution for translation
    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), transient=True) as progress:
        task = progress.add_task("[cyan]Translating chunks...", total=len(chunks))
        with concurrent.futures.ThreadPoolExecutor(max_workers=load_key("max_workers")) as executor:
            futures = []
            for i, chunk in enumerate(chunks):
                future = executor.submit(translate_chunk, chunk, chunks, theme_prompt, i)
                futures.append(future)
            results = []
            try:
                for future in concurrent.futures.as_completed(futures):
                    check_cancel()
                    results.append(future.result())
                    progress.update(task, advance=1)
            except BaseException:
                for f in futures:
                    f.cancel()
                raise

    results.sort(key=lambda x: x[0])  # Sort results based on original order
    
    # 💾 Save results to lists and Excel file
    src_text, trans_text = [], []
    for i, chunk in enumerate(chunks):
        chunk_lines = chunk.split('\n')
        src_text.extend(chunk_lines)
        
        # Calculate similarity between current chunk and translation results
        chunk_text = ''.join(chunk_lines).lower()
        matching_results = [(r, similar(''.join(r[1].split('\n')).lower(), chunk_text)) 
                          for r in results]
        best_match = max(matching_results, key=lambda x: x[1])
        
        # Check similarity and handle exceptions
        if best_match[1] < 0.9:
            console.print(f"[yellow]Warning: No matching translation found for chunk {i}[/yellow]")
            raise ValueError(f"Translation matching failed (chunk {i})")
        elif best_match[1] < 1.0:
            console.print(f"[yellow]Warning: Similar match found (chunk {i}, similarity: {best_match[1]:.3f})[/yellow]")
            
        trans_text.extend(best_match[0][2].split('\n'))
    
    # Trim long translation text
    df_text = pd.read_excel(_2_CLEANED_CHUNKS)
    df_text['text'] = df_text['text'].str.strip('"').str.strip()
    df_translate = pd.DataFrame({'Source': src_text, 'Translation': trans_text})
    subtitle_output_configs = [('trans_subs_for_audio.srt', ['Translation'])]
    df_time = align_timestamp(df_text, df_translate, subtitle_output_configs, output_dir=None, for_display=False)
    console.print(df_time)
    # apply check_len_then_trim to df_time['Translation'], only when duration > MIN_TRIM_DURATION.
    df_time['Translation'] = df_time.apply(lambda x: check_len_then_trim(x['Translation'], x['duration']) if x['duration'] > load_key("min_trim_duration") else x['Translation'], axis=1)
    console.print(df_time)
    
    df_time.to_excel(_4_2_TRANSLATION, index=False)
    console.print("[bold green]✅ Translation completed and results saved.[/bold green]")

if __name__ == '__main__':
    translate_all()
````

---

### 2.A.4 FAIL PENUH: `core/_4_1_summarize.py` — VERBATIM (dahulunya `step4_1_summarize.py`; konteks pipeline: summary + istilah)

````python
import json
from core.prompts import get_summary_prompt
import pandas as pd
from core.utils import *
from core.utils.models import _3_2_SPLIT_BY_MEANING, _4_1_TERMINOLOGY

CUSTOM_TERMS_PATH = 'custom_terms.xlsx'

def combine_chunks():
    """Combine the text chunks identified by whisper into a single long text"""
    with open(_3_2_SPLIT_BY_MEANING, 'r', encoding='utf-8') as file:
        sentences = file.readlines()
    cleaned_sentences = [line.strip() for line in sentences]
    combined_text = ' '.join(cleaned_sentences)
    return combined_text[:load_key('summary_length')]  #! Return only the first x characters

def search_things_to_note_in_prompt(sentence):
    """Search for terms to note in the given sentence"""
    with open(_4_1_TERMINOLOGY, 'r', encoding='utf-8') as file:
        things_to_note = json.load(file)
    things_to_note_list = [term['src'] for term in things_to_note['terms'] if term['src'].lower() in sentence.lower()]
    if things_to_note_list:
        prompt = '\n'.join(
            f'{i+1}. "{term["src"]}": "{term["tgt"]}",'
            f' meaning: {term["note"]}'
            for i, term in enumerate(things_to_note['terms'])
            if term['src'] in things_to_note_list
        )
        return prompt
    else:
        return None

def get_summary():
    src_content = combine_chunks()
    custom_terms = pd.read_excel(CUSTOM_TERMS_PATH)
    custom_terms_json = {
        "terms": 
            [
                {
                    "src": str(row.iloc[0]),
                    "tgt": str(row.iloc[1]), 
                    "note": str(row.iloc[2])
                }
                for _, row in custom_terms.iterrows()
            ]
    }
    if len(custom_terms) > 0:
        rprint(f"📖 Custom Terms Loaded: {len(custom_terms)} terms")
        rprint("📝 Terms Content:", json.dumps(custom_terms_json, indent=2, ensure_ascii=False))
    summary_prompt = get_summary_prompt(src_content, custom_terms_json)
    rprint("📝 Summarizing and extracting terminology ...")
    
    def valid_summary(response_data):
        required_keys = {'src', 'tgt', 'note'}
        if 'terms' not in response_data:
            return {"status": "error", "message": "Invalid response format"}
        for term in response_data['terms']:
            if not all(key in term for key in required_keys):
                return {"status": "error", "message": "Invalid response format"}   
        return {"status": "success", "message": "Summary completed"}

    summary = ask_gpt(summary_prompt, resp_type='json', valid_def=valid_summary, log_title='summary')
    summary['terms'].extend(custom_terms_json['terms'])
    
    with open(_4_1_TERMINOLOGY, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=4)

    rprint(f'💾 Summary log saved to → `{_4_1_TERMINOLOGY}`')

if __name__ == '__main__':
    get_summary()
````

---

### 2.A.5 FAIL PENUH: `core/utils/ask_gpt.py` — VERBATIM (Mandat A4: lapisan retry API + validasi + json_repair + cache prompt)

````python
import os
import json
from threading import Lock
import json_repair
from openai import OpenAI
from core.utils.config_utils import load_key
from rich import print as rprint
from core.utils.decorator import except_handler

# ------------
# cache gpt response
# ------------

LOCK = Lock()
GPT_LOG_FOLDER = 'output/gpt_log'

def _save_cache(model, prompt, resp_content, resp_type, resp, message=None, log_title="default"):
    with LOCK:
        logs = []
        file = os.path.join(GPT_LOG_FOLDER, f"{log_title}.json")
        os.makedirs(os.path.dirname(file), exist_ok=True)
        if os.path.exists(file):
            with open(file, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        logs.append({"model": model, "prompt": prompt, "resp_content": resp_content, "resp_type": resp_type, "resp": resp, "message": message})
        with open(file, 'w', encoding='utf-8') as f:
            json.dump(logs, f, ensure_ascii=False, indent=4)

def _load_cache(prompt, resp_type, log_title):
    with LOCK:
        file = os.path.join(GPT_LOG_FOLDER, f"{log_title}.json")
        if os.path.exists(file):
            with open(file, 'r', encoding='utf-8') as f:
                for item in json.load(f):
                    if item["prompt"] == prompt and item["resp_type"] == resp_type:
                        return item["resp"]
        return False

# ------------
# ask gpt once
# ------------

@except_handler("GPT request failed", retry=5)
def ask_gpt(prompt, resp_type=None, valid_def=None, log_title="default"):
    if not load_key("api.key"):
        raise ValueError("API key is not set")
    # check cache
    cached = _load_cache(prompt, resp_type, log_title)
    if cached:
        rprint("use cache response")
        return cached

    model = load_key("api.model")
    base_url = load_key("api.base_url")
    if 'ark' in base_url:
        base_url = "https://ark.cn-beijing.volces.com/api/v3" # huoshan base url
    elif 'v1' not in base_url:
        base_url = base_url.strip('/') + '/v1'
    client = OpenAI(api_key=load_key("api.key"), base_url=base_url)
    response_format = {"type": "json_object"} if resp_type == "json" and load_key("api.llm_support_json") else None

    messages = [{"role": "user", "content": prompt}]

    params = dict(
        model=model,
        messages=messages,
        response_format=response_format,
        timeout=300
    )
    resp_raw = client.chat.completions.create(**params)

    # process and return full result
    resp_content = resp_raw.choices[0].message.content
    if resp_type == "json":
        resp = json_repair.loads(resp_content)
    else:
        resp = resp_content
    
    # check if the response format is valid
    if valid_def:
        valid_resp = valid_def(resp)
        if valid_resp['status'] != 'success':
            _save_cache(model, prompt, resp_content, resp_type, resp, log_title="error", message=valid_resp['message'])
            raise ValueError(f"❎ API response error: {valid_resp['message']}")

    _save_cache(model, prompt, resp_content, resp_type, resp, log_title=log_title)
    return resp


if __name__ == '__main__':
    from rich import print as rprint
    
    result = ask_gpt("""test respond ```json
{"code": 200, "message": "success"}
```""", resp_type="json")
    rprint(f"Test json output result: {result}")
````

---

## 3. BAHAGIAN B — SRT AI TRANSLATOR: RAW DUMP 100% VERBATIM

> Kod di bawah disalin terus dari `raw.githubusercontent.com/thiswillbeyourgithub/srt_ai_translator/HEAD/srt_ai_translator.py` pada 2026-09-26. Ini adalah KESELURUHAN fail — repositori ini single-file.

### 3.B.1 FAIL PENUH: `srt_ai_translator.py` — VERBATIM (Mandat B1: System/User prompt; B2: arahan natural + tag kekal; B3: regex/XML parser)

````python
#!/usr/bin/env python3
# /// script
# requires-python = ">=3.8"
# dependencies = [
#   "pysrt",
#   "litellm",
#   "tqdm",
#   "loguru",
#   "ffmpeg-python",
# ]
# ///
"""
SRT AI Translator - Translate SRT subtitle files using any LiteLLM-supported
provider (OpenRouter by default), with windowed processing and context awareness.
"""

import argparse
import os
import sys
import time
from pathlib import Path
import pysrt
import litellm
from tqdm import tqdm
import re
from loguru import logger
import ffmpeg
import tempfile

VERSION: str = "1.0.0"

# Accepted finish_reason values from the completion API. Anything else means the
# provider did not cleanly finish the reply: "length" = truncated at the max
# token limit, "content_filter" = censored. Such a reply must be rejected and
# retried rather than parsed into a half-written (and likely malformed) result.
# None is accepted because some providers omit finish_reason on a normal reply.
_OK_FINISH_REASONS = {"stop", "end_turn", "completed", None}


def main():
    # Configure logger to write to ./logs.txt with rotation and retention
    logger.add("./logs.txt", rotation="10 MB", retention="7 days", level="INFO")

    parser = argparse.ArgumentParser(
        description="Translate SRT subtitle files using LiteLLM (OpenRouter by default)"
    )

    parser.add_argument(
        "--input",
        required=True,
        help="Path to the input file: either an SRT subtitle file (.srt) or a "
        "video file to extract subtitles from (any other extension).",
    )
    parser.add_argument(
        "--output",
        help="Path for the output translated SRT file (default: auto-generated based on input and target language)",
    )
    parser.add_argument(
        "--target-language",
        default="English",
        help="Target language for translation (default: English)",
    )
    parser.add_argument(
        "--file-description",
        default="",
        help="Description/context of the file to aid translation (e.g., video type, dialect, domain)",
    )
    parser.add_argument(
        "--window-size",
        type=int,
        default=4,
        help="Number of subtitle entries to process in each batch (default: 4)",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.3,
        help="Sampling temperature for the model (default: 0.3)",
    )
    parser.add_argument(
        "--no-thinking",
        action="store_true",
        help="Disable model reasoning/thinking (sends OpenRouter reasoning "
        "{'enabled': False}). Useful with reasoning models like DeepSeek to make "
        "translation faster and cheaper. Omit to leave the provider default.",
    )
    parser.add_argument(
        "--model",
        default="openrouter/deepseek/deepseek-v4-pro",
        help="LiteLLM model name to use for translation (default: openrouter/deepseek/deepseek-v4-pro)",
    )
    parser.add_argument(
        "--base-url",
        help="Optional API base URL override (LiteLLM api_base). Only needed for "
        "custom/self-hosted endpoints; not required for OpenRouter.",
    )
    parser.add_argument(
        "--api-key",
        help="API key for the provider. If not provided, LiteLLM falls back to the "
        "provider's standard environment variable (e.g. OPENROUTER_API_KEY).",
    )

    args = parser.parse_args()

    # Validate the input file exists up front (covers both subtitle and video).
    if not Path(args.input).exists():
        logger.error(f"Input file '{args.input}' not found")
        sys.exit(1)

    # Validate base URL only when explicitly provided (it is optional now that
    # LiteLLM routes to the provider based on the model prefix).
    if args.base_url and not (
        args.base_url.startswith("http://") or args.base_url.startswith("https://")
    ):
        logger.error(
            f"Base URL must start with http:// or https://, got: {args.base_url}"
        )
        sys.exit(1)

    # Decide how to treat --input from its extension: a .srt file is used
    # directly, anything else is treated as a video whose subtitles are
    # extracted to a temporary SRT file first. srt_file holds the SRT path
    # actually fed to the translator regardless of which branch was taken.
    is_srt_input = Path(args.input).suffix.lower() == ".srt"

    temp_srt_file = None
    temp_srt_path = None
    if is_srt_input:
        srt_file = args.input
    else:
        logger.info(f"Extracting subtitles from video: {args.input}")
        subtitle_streams = list_subtitle_streams(video_path=args.input)

        if not subtitle_streams:
            logger.error("No subtitle streams found in video")
            sys.exit(1)

        # If multiple streams, prompt user for choice
        selected_stream = None
        if len(subtitle_streams) == 1:
            selected_stream = subtitle_streams[0]
            logger.info(
                f"Found 1 subtitle stream: {selected_stream['language']} ({selected_stream['codec_name']})"
            )
        else:
            logger.info(f"Found {len(subtitle_streams)} subtitle streams:")
            for idx, stream in enumerate(subtitle_streams):
                lang = stream.get("language", "unknown")
                codec = stream.get("codec_name", "unknown")
                title = stream.get("title", "")
                title_str = f" - {title}" if title else ""

                # Get preview text to help identify the stream
                preview = get_subtitle_preview(
                    video_path=args.input, stream_index=stream["index"]
                )
                preview_str = f" | Preview: {preview}" if preview else ""

                logger.info(f"  {idx + 1}. {lang} ({codec}){title_str}{preview_str}")

            while True:
                try:
                    choice = input(
                        "Enter the number of the subtitle stream to translate: "
                    )
                    choice_idx = int(choice) - 1
                    if 0 <= choice_idx < len(subtitle_streams):
                        selected_stream = subtitle_streams[choice_idx]
                        break
                    else:
                        print(
                            f"Invalid choice. Please enter a number between 1 and {len(subtitle_streams)}"
                        )
                except (ValueError, KeyboardInterrupt):
                    logger.error("Invalid input or interrupted")
                    sys.exit(1)

        # Extract subtitle to temporary SRT file
        # Using NamedTemporaryFile with delete=False to keep the file for processing
        # We'll clean it up at the end
        temp_srt_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".srt", delete=False
        )
        temp_srt_path = temp_srt_file.name
        temp_srt_file.close()

        try:
            extract_subtitle_stream(
                video_path=args.input,
                stream_index=selected_stream["index"],
                output_path=temp_srt_path,
            )
            logger.info(f"Extracted subtitle to temporary file: {temp_srt_path}")
            srt_file = temp_srt_path

            # Generate default output path if not provided
            # Uses video filename, stream language, and target language for clarity
            if not args.output:
                video_stem = Path(args.input).stem
                stream_lang = selected_stream.get("language", "unknown")
                args.output = f"{video_stem}_{stream_lang}_{args.target_language}.srt"
                logger.info(f"Auto-generated output path: {args.output}")
        except Exception as e:
            logger.error(f"Failed to extract subtitle: {e}")
            Path(temp_srt_path).unlink(missing_ok=True)
            sys.exit(1)

    # Generate default output path for SRT input if not provided
    # Uses SRT filename and target language
    if not args.output:
        srt_stem = Path(srt_file).stem
        args.output = f"{srt_stem}_{args.target_language}.srt"
        logger.info(f"Auto-generated output path: {args.output}")

    # Crash if output file already exists to prevent accidental overwrites.
    # This check is placed AFTER default output path generation so that it also
    # guards auto-generated paths (not just user-supplied ones) and never runs
    # against an unset (None) --output, which would raise a TypeError.
    if Path(args.output).exists():
        logger.error(
            f"Output file '{args.output}' already exists. Please remove it first or choose a different output path."
        )
        sys.exit(1)

    logger.info(f"Processing: {srt_file}")
    logger.info(f"Window size: {args.window_size}")
    logger.info(f"Model: {args.model}")
    logger.info(f"Output: {args.output}")
    logger.info(f"Target language: {args.target_language}")
    if args.file_description:
        logger.info(f"File description: {args.file_description}")

    # Parse SRT file
    try:
        subs = pysrt.open(path=srt_file)
        logger.info(f"Loaded {len(subs)} subtitle entries")
    except Exception as e:
        logger.error(f"Error parsing SRT file: {e}")
        sys.exit(1)

    # LiteLLM is stateless (no client object): credentials and the optional base
    # URL are passed per-call. When api_key is None, LiteLLM falls back to the
    # provider's standard environment variable (e.g. OPENROUTER_API_KEY).

    # Process subtitles in windows
    translated_subs = pysrt.SubRipFile()

    # Continuous-progress file: sits right next to the final output with ".tmp"
    # appended, and is rewritten after every window so a crash/interrupt leaves a
    # usable partial translation to recover from. Reset it up front so we never
    # resume on top of a stale ".tmp" left by a previous (crashed) run.
    tmp_output_path = Path(args.output).with_suffix(Path(args.output).suffix + ".tmp")
    try:
        atomic_save_srt(subs=translated_subs, dest=tmp_output_path)
    except Exception as e:
        logger.error(f"Error initializing temporary output file: {e}")
        sys.exit(1)

    # Create windows of subtitles
    windows = []
    for i in range(0, len(subs), args.window_size):
        window = subs[i : i + args.window_size]
        windows.append(window)

    logger.info(f"Processing {len(windows)} windows...")

    # Build the system prompt ONCE and reuse the identical object for every
    # window. All run-constant instructions (target language, file description,
    # output format) live here so the leading portion of every request is
    # byte-identical, which lets providers reuse their KV/prompt cache across
    # windows instead of re-processing the instructions each time.
    system_prompt = build_system_prompt(
        target_language=args.target_language, file_description=args.file_description
    )

    # Process each window with progress bar
    for window_idx, window in enumerate(tqdm(iterable=windows, desc="Translating")):
        translated_window = translate_window(
            window=window,
            model=args.model,
            system_prompt=system_prompt,
            api_key=args.api_key,
            api_base=args.base_url,
            temperature=args.temperature,
            no_thinking=args.no_thinking,
        )
        translated_subs.extend(translated_window)

        # Write current progress to the temporary file after each window for
        # continuous incremental updates and recovery on failure. The write is
        # atomic (see atomic_save_srt), so an interrupt mid-save never leaves a
        # corrupt ".tmp" - it keeps the previous window's complete contents.
        try:
            atomic_save_srt(subs=translated_subs, dest=tmp_output_path)
        except Exception as e:
            logger.error(f"Error saving progress to temporary file: {e}")
            sys.exit(1)

    # Atomically move the completed temp file onto the final output. os.replace
    # is atomic on the same filesystem (tmp_output_path is a sibling of output),
    # so the final file appears fully written or not at all.
    try:
        os.replace(tmp_output_path, args.output)
        logger.info(f"Translation saved to: {args.output}")
    except Exception as e:
        logger.error(f"Error finalizing output file: {e}")
        sys.exit(1)
    finally:
        # Clean up temporary SRT file if it was created from video extraction
        if temp_srt_file:
            Path(temp_srt_path).unlink(missing_ok=True)
            logger.info("Cleaned up temporary subtitle file")


def atomic_save_srt(subs, dest) -> None:
    """Save a SubRipFile to dest atomically to avoid corruption on interruption.

    The subtitles are first written to a scratch file in the SAME directory as
    dest, then os.replace()'d onto dest. os.replace is atomic on a single
    filesystem (keeping the scratch a sibling of dest guarantees that), so a
    crash or interrupt during the write leaves dest either at its previous
    complete contents or fully updated, never half-written. The scratch file is
    removed if anything fails before the replace.

    Parameters
    ----------
    subs : pysrt.SubRipFile
        The subtitle file to persist.
    dest : str or pathlib.Path
        Destination path to atomically write.
    """
    dest = Path(dest)
    # ".part" scratch next to dest so the subsequent os.replace stays on one
    # filesystem (a cross-filesystem replace would not be atomic).
    scratch = dest.with_name(dest.name + ".part")
    try:
        subs.save(path=str(scratch), encoding="utf-8")
        os.replace(scratch, dest)
    finally:
        # Only reached with scratch still present if save() failed or os.replace
        # did not consume it; a successful replace leaves nothing to clean up.
        if scratch.exists():
            scratch.unlink(missing_ok=True)


def build_system_prompt(target_language: str, file_description: str) -> str:
    """Build the run-constant system prompt shared by every window.

    Everything that does not change between windows (target language, file
    description, output format and rules) lives here so that the leading portion
    of every request is byte-identical. Reusing an identical prefix is what lets
    providers serve it from their prompt/KV cache instead of re-processing it for
    each window, which is the whole point of factoring it out of the per-window
    user message.

    Parameters
    ----------
    target_language : str
        Target language for translation.
    file_description : str
        Description/context of the file to aid translation (may be empty).

    Returns
    -------
    str
        The system prompt.
    """
    file_description_xml = (
        f"<file-description>{file_description}</file-description>"
        if file_description
        else "<file-description></file-description>"
    )

    return f"""You are a professional subtitle translator. Translate every subtitle text the user sends into {target_language}, producing accurate and natural translations that respect the context.

Each subtitle is provided as an XML element of the form:
<text id="N" start="HH:MM:SS,mmm" end="HH:MM:SS,mmm">original text</text>
The start/end timing is context only (it tells you whether this is rapid dialogue or if significant time has passed between subtitles); never translate, echo or alter the ids or the timings.

The following describes the file being translated (may be empty):
{file_description_xml}

Reply with EXACTLY one <text> element per input subtitle, reusing the same ids, wrapped in a single <answer> block, and output nothing else, in this exact format:
<answer>
<text id="1">translated text here</text>
<text id="2">translated text here</text>
...
</answer>"""


def translate_window(
    window,
    model,
    system_prompt,
    api_key=None,
    api_base=None,
    temperature=0.3,
    no_thinking=False,
    max_retries=5,
    base_delay=1.0,
):
    """Translate a window of subtitle entries using a LiteLLM-supported provider

    Retries with exponential backoff. Three failure modes are retried: transient
    provider/network errors, replies the provider did not cleanly finish (bad
    finish_reason, e.g. truncation), and malformed replies (including replies that
    do not contain exactly one translated chunk per input subtitle, which is
    enforced by parse_xml_response). On a malformed reply the model's bad answer
    plus a correction are appended as extra turns, while the [system, user] prefix
    is kept byte-identical so it stays cacheable across retries and across windows.
    Authentication errors are never retried (they cannot succeed on retry).

    Parameters
    ----------
    window : list
        List of subtitle entries to translate.
    model : str
        LiteLLM model name to use for translation.
    system_prompt : str
        Run-constant system prompt (see build_system_prompt); identical across
        windows to maximize provider-side prompt/KV caching.
    api_key : str, optional
        API key for the provider. If None, LiteLLM uses the provider's standard
        environment variable.
    api_base : str, optional
        Optional API base URL override (LiteLLM api_base).
    temperature : float, optional
        Sampling temperature passed to the model (default: 0.3).
    no_thinking : bool, optional
        When True, disable model reasoning/thinking by sending OpenRouter's
        reasoning {"enabled": False} in extra_body. When False, the reasoning
        field is omitted so the provider default applies (default: False).
    max_retries : int, optional
        Maximum number of attempts before falling back to the untranslated
        window (default: 5).
    base_delay : float, optional
        Base delay in seconds for exponential backoff; attempt N waits
        base_delay * 2**N seconds (default: 1.0).

    Returns
    -------
    list
        Translated SubRipItem entries, or the original (untranslated) window as a
        fallback if every attempt fails.
    """
    # Build the variable, per-window user message: only the subtitle texts (with
    # timing) go here. Keeping this separate from the constant system prompt is
    # what makes the cacheable prefix identical across windows.
    xml_texts = [
        f'<text id="{i}" start="{sub.start}" end="{sub.end}">{sub.text}</text>'
        for i, sub in enumerate(window, start=1)
    ]
    user_content = "Translate these subtitles:\n" + "\n".join(xml_texts)

    # The [system, user] prefix stays constant; correction turns are only ever
    # appended after it, preserving the cacheable prefix.
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    for attempt in range(max_retries):
        # --- Call the provider (transient errors are retried with backoff) ---
        try:
            completion_kwargs = dict(
                model=model,
                messages=messages,
                temperature=temperature,
                api_key=api_key,
                api_base=api_base,
            )
            # Disabling reasoning ("thinking") is an OpenRouter request-body field
            # passed through extra_body. {"enabled": False} turns thinking off for
            # reasoning models like DeepSeek; omitting the field entirely leaves
            # the provider default (thinking on). Confirmed against OpenRouter.
            if no_thinking:
                completion_kwargs["extra_body"] = {"reasoning": {"enabled": False}}

            response = litellm.completion(**completion_kwargs)
            choice = response.choices[0]

            # Finish-reason guard: reject a truncated ("length") or censored
            # ("content_filter") completion instead of parsing a half-written
            # reply. Raising here routes into the backoff-retry branch below.
            finish_reason = getattr(choice, "finish_reason", None)
            if finish_reason not in _OK_FINISH_REASONS:
                raise RuntimeError(
                    f"provider ended the completion with finish_reason={finish_reason!r} "
                    f"('length' = truncated at the provider max, 'content_filter' = censored)"
                )

            response_text = choice.message.content
            if response_text is None:
                raise RuntimeError(
                    f"provider returned empty content (finish_reason={finish_reason!r})"
                )
        except litellm.AuthenticationError as e:
            # Authentication errors cannot be fixed by retrying, so crash.
            logger.error(f"API authentication failed - check API key: {e}")
            raise
        except Exception as e:
            if attempt < max_retries - 1:
                delay = base_delay * (2**attempt)
                logger.warning(
                    f"Provider call failed (attempt {attempt + 1}/{max_retries}): {e}. "
                    f"Retrying in {delay:.1f}s"
                )
                time.sleep(delay)
                continue
            logger.error(
                f"Failed to translate window after {max_retries} attempts: {e}"
            )
            # Return original texts as fallback so the run can still complete.
            return window

        # --- Validate the reply: must parse and yield exactly len(window) chunks ---
        try:
            translated_texts = parse_xml_response(response_text, len(window))
        except Exception as e:
            # Log a truncated snippet of the raw reply so parsing failures are
            # diagnosable (e.g. spotting unexpected tag shapes) without dumping
            # the whole, potentially large, response into the logs.
            snippet = response_text.strip().replace("\n", " ")[:300]
            if attempt < max_retries - 1:
                delay = base_delay * (2**attempt)
                logger.warning(
                    f"Invalid response (attempt {attempt + 1}/{max_retries}): {e}. "
                    f"Retrying in {delay:.1f}s. Raw reply (truncated): {snippet!r}"
                )
                # Append the bad answer and a correction as new turns; the
                # [system, user] prefix above is left untouched for caching.
                messages = messages + [
                    {"role": "assistant", "content": response_text},
                    {
                        "role": "user",
                        "content": (
                            f"That response was invalid: {e}. Re-send the translation "
                            f"for ALL {len(window)} subtitles, exactly one <text> "
                            f"element per id, in the required <answer> format and nothing else."
                        ),
                    },
                ]
                time.sleep(delay)
                continue
            logger.error(
                f"Failed to parse a valid response after {max_retries} attempts: {e}. "
                f"Raw reply (truncated): {snippet!r}"
            )
            return window

        # --- Success: build the translated subtitle entries ---
        translated_window = []
        for original_sub, translated_text in zip(window, translated_texts):
            new_sub = pysrt.SubRipItem(
                index=original_sub.index,
                start=original_sub.start,
                end=original_sub.end,
                text=translated_text,
            )
            translated_window.append(new_sub)

        return translated_window


def list_subtitle_streams(video_path: str) -> list:
    """List all subtitle streams in the video file

    Parameters
    ----------
    video_path : str
        Path to the video file

    Returns
    -------
    list
        List of subtitle stream information dictionaries
    """
    try:
        probe = ffmpeg.probe(filename=video_path)
        subtitle_streams = [
            stream for stream in probe["streams"] if stream["codec_type"] == "subtitle"
        ]
        return subtitle_streams
    except ffmpeg.Error as e:
        logger.error(f"ffmpeg error while probing video: {e.stderr.decode()}")
        raise
    except Exception as e:
        logger.error(f"Error probing video file: {e}")
        raise


def get_subtitle_preview(video_path: str, stream_index: int) -> str:
    """Get a preview text from a subtitle stream

    Extracts the first text that appears after the 5th text containing at least 10 characters.
    This helps identify subtitle streams when metadata is unclear.

    Parameters
    ----------
    video_path : str
        Path to the video file
    stream_index : int
        Index of the subtitle stream

    Returns
    -------
    str
        Preview text, or empty string if extraction fails or not enough content
    """
    temp_preview_file = None
    try:
        # Create temp file for preview extraction
        temp_preview_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".srt", delete=False
        )
        temp_preview_path = temp_preview_file.name
        temp_preview_file.close()

        # Extract subtitle stream
        extract_subtitle_stream(
            video_path=video_path,
            stream_index=stream_index,
            output_path=temp_preview_path,
        )

        # Parse and find the target text
        subs = pysrt.open(path=temp_preview_path)

        # Find the 5th text with at least 10 characters
        # Track all seen texts to ensure preview is unique
        count = 0
        target_index = None
        seen_texts = set()

        for idx, sub in enumerate(subs):
            text = sub.text.strip()
            seen_texts.add(text)
            if len(text) >= 10:
                count += 1
                if count == 5:
                    # Now find the first unique text after this one
                    target_index = idx + 1
                    break

        # Get the first unique text after the 5th qualifying text
        if target_index is not None:
            for idx in range(target_index, len(subs)):
                preview_text = subs[idx].text.strip()
                # Skip if we've seen this text before
                if preview_text not in seen_texts:
                    # Limit preview length to avoid clutter
                    if len(preview_text) > 80:
                        preview_text = preview_text[:77] + "..."
                    return preview_text
                # Add to seen_texts to track duplicates
                seen_texts.add(preview_text)

        return ""

    except Exception as e:
        logger.debug(f"Could not extract preview for stream {stream_index}: {e}")
        return ""
    finally:
        # Clean up temp file
        if temp_preview_file:
            Path(temp_preview_path).unlink(missing_ok=True)


def extract_subtitle_stream(video_path: str, stream_index: int, output_path: str):
    """Extract a subtitle stream from video to SRT file

    Parameters
    ----------
    video_path : str
        Path to the video file
    stream_index : int
        Index of the subtitle stream to extract
    output_path : str
        Path for the output SRT file
    """
    try:
        # Use ffmpeg to extract the subtitle stream
        # Map the specific subtitle stream and convert to SRT format
        (
            ffmpeg.input(filename=video_path)
            .output(filename=output_path, map=f"0:{stream_index}", format="srt")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        logger.error(f"ffmpeg error while extracting subtitle: {e.stderr.decode()}")
        raise
    except Exception as e:
        logger.error(f"Error extracting subtitle stream: {e}")
        raise


def parse_xml_response(response_text, expected_count):
    """Parse XML response and extract translated texts"""
    try:
        # Extract answer block (case-insensitive so <Answer>/<ANSWER> also match)
        answer_match = re.search(
            pattern=r"<answer>(.*?)</answer>",
            string=response_text,
            flags=re.DOTALL | re.IGNORECASE,
        )
        if not answer_match:
            raise ValueError("No <answer> block found in response")

        answer_content = answer_match.group(1)

        # Parse individual <text> elements. The pattern is deliberately lenient
        # because models frequently mirror the input tag and re-emit the start/end
        # timing attributes (e.g. <text id="1" start="..." end="...">) despite the
        # instruction not to: [^>]* swallows any extra attributes after the id, and
        # the id quotes are optional. Being strict here caused every element to
        # fail to match ("Expected N text elements, found 0").
        text_pattern = r'<text\s+id=["\']?(\d+)["\']?[^>]*>(.*?)</text>'
        matches = re.findall(
            pattern=text_pattern,
            string=answer_content,
            flags=re.DOTALL | re.IGNORECASE,
        )

        if len(matches) != expected_count:
            raise ValueError(
                f"Expected {expected_count} text elements, found {len(matches)}"
            )

        # Sort by ID and extract texts
        matches.sort(key=lambda x: int(x[0]))
        translated_texts = [match[1].strip() for match in matches]

        return translated_texts

    except Exception as e:
        raise ValueError(f"XML parsing failed: {str(e)}")


if __name__ == "__main__":
    main()
````

---

## 4. STATUS PENYERAHAN

| Keperluan mandat | Status |
|---|---|
| Ekstrak verbatim `get_prompt_faithfulness()` | ✅ Seksyen 2.A.1 — fail penuh `core/prompts.py` |
| Ekstrak verbatim `get_prompt_expressiveness()` | ✅ Seksyen 2.A.1 — fail penuh `core/prompts.py` |
| Logik pertukaran data Fasa 1 (direct) → Fasa 2 (reflection + free) | ✅ Seksyen 2.A.2 — fail penuh `core/translate_lines.py` |
| Pengurusan fallback fasa kedua gagal / baris lari | ✅ Seksyen 2.A.2 + 2.A.3 + 2.A.5 — `retry_translation` (3 retry, `prompt+retry*" "`, `valid_def`, semakan `len()`), sanitasi `.replace('\n', ' ')`, semakan length mismatch, gate `reflect_translate`, padanan `SequenceMatcher` 0.9/1.0, `@except_handler(retry=5)`, `json_repair.loads`, cache prompt |
| Sistem Prompt & User Prompt XML asal (SRT AI Translator) | ✅ Seksyen 3.B.1 — `build_system_prompt()` + pembinan `user_content` dalam `translate_window()` |
| Arahan bahasa natural + tag XML tidak tercicir | ✅ Seksyen 3.B.1 — system prompt ("accurate and natural translations" + "EXACTLY one `<text>` element per input subtitle... output nothing else") + enforcement `parse_xml_response` + correction turns |
| Skema regex / XML parser rasmi | ✅ Seksyen 3.B.1 — `parse_xml_response()` (regex `<answer>` + `<text\s+id=...>`, kiraan mesti sama, susun ikut id) + `_OK_FINISH_REASONS` |
| Kod SubFaber (`src/`) dibekukan | ✅ TIADA sebarang fail dalam `src/`, `index.js`, `public/`, atau mana-mana kod projek disentuh — hanya fail laporan ini ditulis ke `plans/` |
| Laporan disimpan di `plans/ground-truth-videolingo-vs-srtaitranslator-full.md` | ✅ Dokumen ini |

**RAW DUMP SELESAI — MENUNGGU PENILAIAN PROJECT OWNER. TIADA RUMUSAN DIBERIKAN.**

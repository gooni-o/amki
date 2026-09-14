import React, { useState, useRef, useMemo, useCallback } from "react";
import { ArrowLeft, ArrowRight, Shuffle, RotateCcw, Check, X } from "lucide-react";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap');
`;

const COLORS = {
  paper: "#FFFFFF",
  paperLine: "#DCEBC8",
  card: "#FBFDF7",
  ink: "#28361E",
  inkSoft: "#72886A",
  correct: "#5C9A34",
  correctBg: "#E8F4DA",
  wrong: "#B98A3D",
  wrongBg: "#F6EFDD",
  active: "#7FB93F",
  activeBg: "#EFF8E2",
  note: "#96A88A",
  bracket: "#A9BC9C",
};

function normalize(s) {
  return (s || "").replace(/\s+/g, "");
}

function hasLetter(s) {
  return /[\p{L}\p{N}]/u.test(s);
}

function tokenizeLine(line) {
  // Split out [ ... ] segments first: their contents are never blankable.
  const parts = line.split(/(\[[^\]]*\])/g).filter((p) => p.length > 0);
  const tokens = [];
  parts.forEach((part) => {
    if (/^\[[^\]]*\]$/.test(part)) {
      tokens.push({ text: part, type: "word", bracket: true });
    } else {
      const matches = part.match(/\s+|\S+/g) || [];
      matches.forEach((m) => {
        tokens.push({
          text: m,
          type: /^\s+$/.test(m) ? "space" : "word",
          bracket: false,
        });
      });
    }
  });
  return tokens.map((t, i) => ({ ...t, id: i }));
}

function isNoteLine(line) {
  return line.trim().startsWith("*");
}

function splitNotesAndContent(blockText) {
  const rawLines = blockText.split("\n");
  const notes = [];
  const content = [];
  rawLines.forEach((line) => {
    if (isNoteLine(line)) {
      notes.push(line.trim().replace(/^\*+\s?/, ""));
    } else {
      content.push(line);
    }
  });
  return { notes, content: content.join("\n") };
}

function buildEntry(rawText, ratio, entryIdx, notes) {
  const lines = rawText.split("\n").map((line, lineIdx) => {
    const tokens = tokenizeLine(line).map((t, ti) => ({
      ...t,
      id: `${entryIdx}_${lineIdx}_${ti}`,
    }));
    return tokens;
  });

  // [ ] segments are notes/explanations, never eligible to become blanks.
  const candidates = [];
  lines.forEach((tokens) => {
    tokens.forEach((t) => {
      if (t.type === "word" && !t.bracket && hasLetter(t.text)) candidates.push(t.id);
    });
  });

  const pool =
    candidates.length > 0
      ? candidates
      : lines.flat().filter((t) => t.type === "word" && !t.bracket).map((t) => t.id);
  const numBlanks = Math.max(1, Math.min(pool.length, Math.round(pool.length * ratio)));

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const blankIds = new Set(shuffled.slice(0, numBlanks));

  let blankOrder = 0;
  const linesWithBlanks = lines.map((tokens) =>
    tokens.map((t) => {
      if (t.type === "word" && !t.bracket && blankIds.has(t.id)) {
        const marked = { ...t, blank: true, order: blankOrder };
        blankOrder += 1;
        return marked;
      }
      return t;
    })
  );

  return {
    raw: rawText,
    lines: linesWithBlanks,
    blankCount: blankOrder,
    notes: notes || [],
  };
}

function buildQuiz(entries, ratio) {
  return entries.map((e, i) => buildEntry(e.content, ratio, i, e.notes));
}

function parseEntries(rawText) {
  return rawText
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(splitNotesAndContent)
    .filter((e) => e.content.trim().length > 0);
}

export default function ClozeMemorizer() {
  const [rawText, setRawText] = useState("");
  const [ratio, setRatio] = useState(0.32);
  const [screen, setScreen] = useState("input"); // input | practice | result
  const [quiz, setQuiz] = useState([]);
  const [current, setCurrent] = useState(0);
  const [entryState, setEntryState] = useState({}); // idx -> {values, checked, correctMap}
  const [activeIndices, setActiveIndices] = useState([]); // which original indices are in play (for retry-wrong mode)
  const inputRefs = useRef({});

  const entries = useMemo(() => parseEntries(rawText), [rawText]);

  const startQuiz = () => {
    if (entries.length === 0) return;
    const built = buildQuiz(entries, ratio);
    setQuiz(built);
    setEntryState({});
    setActiveIndices(built.map((_, i) => i));
    setCurrent(0);
    setScreen("practice");
  };

  const getState = (idx) =>
    entryState[idx] || { values: {}, checked: false, correctMap: {} };

  const setValue = (idx, blankId, val) => {
    setEntryState((prev) => ({
      ...prev,
      [idx]: {
        ...getState(idx),
        values: { ...getState(idx).values, [blankId]: val },
      },
    }));
  };

  const focusBlank = (entryIdx, order) => {
    const key = `${entryIdx}_${order}`;
    const el = inputRefs.current[key];
    if (el) el.focus();
  };

  const handleCheck = (idx) => {
    const entry = quiz[idx];
    const state = getState(idx);
    const correctMap = {};
    entry.lines.flat().forEach((t) => {
      if (t.blank) {
        const userVal = state.values[t.id] || "";
        correctMap[t.id] = normalize(userVal) === normalize(t.text);
      }
    });
    setEntryState((prev) => ({
      ...prev,
      [idx]: { ...state, checked: true, correctMap },
    }));
  };

  const handleKeyDown = (e, idx, order, blankCount) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (order < blankCount - 1) {
        focusBlank(idx, order + 1);
      } else {
        handleCheck(idx);
      }
    }
  };

  const reshuffleCurrent = () => {
    const original = quiz[current].raw;
    const rebuilt = buildEntry(original, ratio, current, quiz[current].notes);
    setQuiz((prev) => {
      const next = [...prev];
      next[current] = rebuilt;
      return next;
    });
    setEntryState((prev) => ({ ...prev, [current]: { values: {}, checked: false, correctMap: {} } }));
  };

  const goTo = (idx) => {
    if (idx < 0 || idx >= quiz.length) return;
    setCurrent(idx);
  };

  const summary = useMemo(() => {
    let totalBlanks = 0;
    let correctBlanks = 0;
    let fullyCorrect = 0;
    let attempted = 0;
    activeIndices.forEach((idx) => {
      const entry = quiz[idx];
      const state = getState(idx);
      if (!entry) return;
      totalBlanks += entry.blankCount;
      if (state.checked) {
        attempted += 1;
        let allOk = true;
        Object.values(state.correctMap).forEach((v) => {
          if (v) correctBlanks += 1;
          else allOk = false;
        });
        if (allOk) fullyCorrect += 1;
      }
    });
    return { totalBlanks, correctBlanks, fullyCorrect, attempted, total: activeIndices.length };
  }, [quiz, entryState, activeIndices]);

  const finishAndReview = () => setScreen("result");

  const retryWrongOnly = () => {
    const wrongIdx = activeIndices.filter((idx) => {
      const state = getState(idx);
      if (!state.checked) return true;
      return Object.values(state.correctMap).some((v) => !v);
    });
    const rebuilt = { ...quizAsMap() };
    const newQuiz = [...quiz];
    const newEntryState = { ...entryState };
    wrongIdx.forEach((idx) => {
      newQuiz[idx] = buildEntry(quiz[idx].raw, ratio, idx, quiz[idx].notes);
      newEntryState[idx] = { values: {}, checked: false, correctMap: {} };
    });
    setQuiz(newQuiz);
    setEntryState(newEntryState);
    setActiveIndices(wrongIdx.length > 0 ? wrongIdx : activeIndices);
    setCurrent(wrongIdx[0] ?? 0);
    setScreen("practice");
  };

  function quizAsMap() {
    return {};
  }

  const resetAll = () => {
    const built = buildQuiz(entries, ratio);
    setQuiz(built);
    setEntryState({});
    setActiveIndices(built.map((_, i) => i));
    setCurrent(0);
    setScreen("practice");
  };

  const backToInput = () => {
    setScreen("input");
  };

  // ---------- RENDER ----------

  const ratioOptions = [
    { label: "조금", value: 0.17 },
    { label: "보통", value: 0.32 },
    { label: "많이", value: 0.52 },
    { label: "전체", value: 1 },
  ];

  return (
    <div
      style={{
        minHeight: "100%",
        background: COLORS.paper,
        fontFamily: "'Noto Sans KR', sans-serif",
        color: COLORS.ink,
        padding: "32px 16px",
        boxSizing: "border-box",
      }}
    >
      <style>{FONT_IMPORT}</style>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              fontFamily: "'Noto Serif KR', serif",
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            문장암기장
          </div>
          <div style={{ color: COLORS.inkSoft, fontSize: 14, marginTop: 4 }}>
            빈칸을 채우며 문장을 외워보세요
          </div>
        </header>

        {screen === "input" && (
          <InputScreen
            rawText={rawText}
            setRawText={setRawText}
            entries={entries}
            ratio={ratio}
            setRatio={setRatio}
            ratioOptions={ratioOptions}
            onStart={startQuiz}
          />
        )}

        {screen === "practice" && quiz[current] && (
          <PracticeScreen
            quiz={quiz}
            current={current}
            activeIndices={activeIndices}
            state={getState(current)}
            setValue={setValue}
            handleCheck={handleCheck}
            handleKeyDown={handleKeyDown}
            inputRefs={inputRefs}
            reshuffleCurrent={reshuffleCurrent}
            goTo={goTo}
            backToInput={backToInput}
            finishAndReview={finishAndReview}
          />
        )}

        {screen === "result" && (
          <ResultScreen
            summary={summary}
            quiz={quiz}
            activeIndices={activeIndices}
            entryState={entryState}
            goTo={(idx) => {
              setCurrent(idx);
              setScreen("practice");
            }}
            retryWrongOnly={retryWrongOnly}
            resetAll={resetAll}
            backToInput={backToInput}
          />
        )}
      </div>
    </div>
  );
}

function InputScreen({ rawText, setRawText, entries, ratio, setRatio, ratioOptions, onStart }) {
  return (
    <div>
      <div
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.paperLine}`,
          borderRadius: 4,
          padding: 4,
        }}
      >
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={
            "암기하고 싶은 문장을 입력하세요.\n문장과 문장 사이는 빈 줄로 구분합니다.\n\n예)\n오늘은 어제의 결과이고, 내일은 오늘의 결과다.\n* 출처: 오프라 윈프리\n\n피할 수 없으면 [기꺼이] 즐겨라."
          }
          style={{
            width: "100%",
            minHeight: 260,
            resize: "vertical",
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "'Noto Serif KR', serif",
            fontSize: 16,
            lineHeight: 1.9,
            color: COLORS.ink,
            padding: 16,
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: COLORS.inkSoft, lineHeight: 1.7 }}>
        빈 줄로 문장을 구분하고, <strong style={{ color: COLORS.ink }}>*</strong>로 시작하는 줄과{" "}
        <strong style={{ color: COLORS.ink }}>[ ]</strong> 안의 내용은 암기 대상에서 제외돼요
        <br />
        정답을 채점할 때 띄어쓰기는 영향을 주지 않아요. 그 외 글자는 정확히 일치해야 정답으로 인정돼요
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 6,
          fontSize: 13,
        }}
      >
        <span
          style={{
            fontFamily: "'Noto Serif KR', serif",
            color: COLORS.ink,
            fontWeight: 600,
          }}
        >
          {entries.length}개의 문장
        </span>
      </div>

      <div style={{ marginTop: 32 }}>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 10 }}>
          빈칸 비율
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {ratioOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRatio(opt.value)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 4,
                border: `1px solid ${ratio === opt.value ? COLORS.ink : COLORS.paperLine}`,
                background: ratio === opt.value ? COLORS.ink : "transparent",
                color: ratio === opt.value ? COLORS.paper : COLORS.ink,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "'Noto Sans KR', sans-serif",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onStart}
        disabled={entries.length === 0}
        style={{
          marginTop: 32,
          width: "100%",
          padding: "14px 0",
          borderRadius: 4,
          border: "none",
          background: entries.length === 0 ? COLORS.paperLine : COLORS.ink,
          color: COLORS.paper,
          fontSize: 15,
          fontWeight: 600,
          cursor: entries.length === 0 ? "not-allowed" : "pointer",
          fontFamily: "'Noto Sans KR', sans-serif",
        }}
      >
        학습 시작
      </button>
    </div>
  );
}

function PracticeScreen({
  quiz,
  current,
  activeIndices,
  state,
  setValue,
  handleCheck,
  handleKeyDown,
  inputRefs,
  reshuffleCurrent,
  goTo,
  backToInput,
  finishAndReview,
}) {
  const entry = quiz[current];
  const posInActive = activeIndices.indexOf(current);
  const isLast = posInActive === activeIndices.length - 1;

  let correctCount = 0;
  if (state.checked) {
    correctCount = Object.values(state.correctMap).filter(Boolean).length;
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <button onClick={backToInput} style={iconButtonStyle}>
          <ArrowLeft size={16} />
          <span style={{ fontSize: 13 }}>새로 입력</span>
        </button>
        <div style={{ fontSize: 13, color: COLORS.inkSoft }}>
          {posInActive + 1} / {activeIndices.length}
        </div>
        <button onClick={reshuffleCurrent} style={iconButtonStyle}>
          <Shuffle size={15} />
          <span style={{ fontSize: 13 }}>다시 섞기</span>
        </button>
      </div>

      <div
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.paperLine}`,
          borderRadius: 4,
          padding: "36px 28px",
          backgroundImage: `repeating-linear-gradient(${COLORS.card}, ${COLORS.card} 42px, ${COLORS.paperLine}55 43px)`,
          minHeight: 180,
        }}
      >
        <div
          style={{
            fontFamily: "'Noto Serif KR', serif",
            fontSize: 19,
            lineHeight: "43px",
            color: COLORS.ink,
          }}
        >
          {entry.lines.map((tokens, li) => (
            <React.Fragment key={li}>
              {tokens.map((t) => {
                if (t.type === "space") return <span key={t.id}>{t.text}</span>;
                if (t.bracket)
                  return (
                    <span key={t.id} style={{ color: COLORS.bracket, fontSize: 15 }}>
                      {t.text}
                    </span>
                  );
                if (!t.blank) return <span key={t.id}>{t.text}</span>;

                const isChecked = state.checked;
                const isCorrect = isChecked && state.correctMap[t.id];
                const isWrong = isChecked && !state.correctMap[t.id];

                return (
                  <span key={t.id} style={{ display: "inline-block", verticalAlign: "middle" }}>
                    <input
                      ref={(el) => {
                        inputRefs.current[`${current}_${t.order}`] = el;
                      }}
                      value={state.values[t.id] || ""}
                      disabled={isChecked}
                      onChange={(e) => setValue(current, t.id, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, current, t.order, entry.blankCount)}
                      style={{
                        width: `${Math.max(t.text.length, 2) * 1.15}em`,
                        fontFamily: "'Noto Serif KR', serif",
                        fontSize: 19,
                        textAlign: "center",
                        border: "none",
                        borderBottom: `2px solid ${
                          isCorrect ? COLORS.correct : isWrong ? COLORS.wrong : COLORS.ink
                        }`,
                        background: isCorrect
                          ? COLORS.correctBg
                          : isWrong
                          ? COLORS.wrongBg
                          : COLORS.activeBg,
                        outline: "none",
                        padding: "1px 4px",
                        borderRadius: 2,
                        color: COLORS.ink,
                        margin: "0 2px",
                      }}
                    />
                    {isWrong && (
                      <span
                        style={{
                          fontSize: 13,
                          color: COLORS.correct,
                          fontFamily: "'Noto Serif KR', serif",
                          marginLeft: 2,
                        }}
                      >
                        ({t.text})
                      </span>
                    )}
                  </span>
                );
              })}
              <br />
            </React.Fragment>
          ))}
        </div>
      </div>

      {entry.notes.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 13, color: COLORS.note, lineHeight: 1.6 }}>
          {entry.notes.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, minHeight: 20, fontSize: 13, color: COLORS.inkSoft }}>
        {state.checked && (
          <span>
            {entry.blankCount}개 중{" "}
            <strong style={{ color: correctCount === entry.blankCount ? COLORS.correct : COLORS.wrong }}>
              {correctCount}개
            </strong>{" "}
            정답
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => goTo(current - 1)}
          disabled={posInActive === 0}
          style={{ ...navButtonStyle, opacity: posInActive === 0 ? 0.4 : 1 }}
        >
          <ArrowLeft size={16} />
        </button>

        {!state.checked ? (
          <button onClick={() => handleCheck(current)} style={primaryButtonStyle}>
            <Check size={16} />
            확인
          </button>
        ) : isLast ? (
          <button onClick={finishAndReview} style={primaryButtonStyle}>
            결과 보기
          </button>
        ) : (
          <button onClick={() => goTo(activeIndices[posInActive + 1])} style={primaryButtonStyle}>
            다음 문장
            <ArrowRight size={16} />
          </button>
        )}

        <button
          onClick={() => goTo(current + 1)}
          disabled={posInActive === activeIndices.length - 1}
          style={{ ...navButtonStyle, opacity: posInActive === activeIndices.length - 1 ? 0.4 : 1 }}
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function ResultScreen({ summary, quiz, activeIndices, entryState, goTo, retryWrongOnly, resetAll, backToInput }) {
  const pct = summary.totalBlanks > 0 ? Math.round((summary.correctBlanks / summary.totalBlanks) * 100) : 0;
  const anyWrong = activeIndices.some((idx) => {
    const s = entryState[idx];
    if (!s || !s.checked) return true;
    return Object.values(s.correctMap).some((v) => !v);
  });

  return (
    <div>
      <div
        style={{
          fontFamily: "'Noto Serif KR', serif",
          fontSize: 20,
          fontWeight: 600,
          marginBottom: 20,
        }}
      >
        학습 결과
      </div>

      <div
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.paperLine}`,
          borderRadius: 4,
          padding: 24,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 36, fontWeight: 700 }}>
          {summary.correctBlanks}
        </span>
        <span style={{ color: COLORS.inkSoft, fontSize: 16 }}>/ {summary.totalBlanks}개 어절 정답</span>
        <span style={{ marginLeft: "auto", color: COLORS.inkSoft, fontSize: 14 }}>{pct}%</span>
      </div>

      <div style={{ marginTop: 20 }}>
        {activeIndices.map((idx) => {
          const s = entryState[idx];
          const entry = quiz[idx];
          const preview = entry.raw.split("\n")[0].slice(0, 28);
          let ok = false;
          if (s && s.checked) {
            ok = Object.values(s.correctMap).every(Boolean) && Object.values(s.correctMap).length > 0;
          }
          return (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 4px",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${COLORS.paperLine}`,
                cursor: "pointer",
                fontFamily: "'Noto Sans KR', sans-serif",
              }}
            >
              {s && s.checked ? (
                ok ? (
                  <Check size={15} color={COLORS.correct} />
                ) : (
                  <X size={15} color={COLORS.wrong} />
                )
              ) : (
                <span style={{ width: 15, height: 15, display: "inline-block" }} />
              )}
              <span style={{ fontSize: 14, color: COLORS.ink, fontFamily: "'Noto Serif KR', serif" }}>
                {preview}
                {entry.raw.length > 28 ? "…" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
        {anyWrong && (
          <button onClick={retryWrongOnly} style={primaryButtonStyle}>
            틀린 문장만 다시 풀기
          </button>
        )}
        <button onClick={resetAll} style={secondaryButtonStyle}>
          <RotateCcw size={15} />
          전체 다시 섞어서 풀기
        </button>
        <button onClick={backToInput} style={secondaryButtonStyle}>
          새 문장 입력하기
        </button>
      </div>
    </div>
  );
}

const iconButtonStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  background: "transparent",
  border: "none",
  color: COLORS.inkSoft,
  cursor: "pointer",
  padding: "4px 6px",
  fontFamily: "'Noto Sans KR', sans-serif",
};

const primaryButtonStyle = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "12px 0",
  borderRadius: 4,
  border: "none",
  background: COLORS.ink,
  color: COLORS.paper,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'Noto Sans KR', sans-serif",
};

const secondaryButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "12px 0",
  borderRadius: 4,
  border: `1px solid ${COLORS.paperLine}`,
  background: "transparent",
  color: COLORS.ink,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "'Noto Sans KR', sans-serif",
};

const navButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  borderRadius: 4,
  border: `1px solid ${COLORS.paperLine}`,
  background: "transparent",
  color: COLORS.ink,
  cursor: "pointer",
};

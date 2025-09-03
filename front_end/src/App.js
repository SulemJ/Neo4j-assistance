import { useState, useRef } from "react";

function App() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', text, cypher_query?, results? }
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;
    const userText = prompt.trim();

    // prepare new messages (optimistic add)
    const newMessages = [...messages, { role: "user", text: userText }];

    // update UI immediately
    setMessages(newMessages);
    setPrompt("");
    setLoading(true);
    inputRef.current?.focus();

    try {
      const res = await fetch("http://localhost:8000/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // send history so backend can perform multi-turn reasoning
        body: JSON.stringify({ prompt: userText, history: newMessages }),
      });
      const data = await res.json();

      // add assistant message (explanation + cypher + results)
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.explanation ?? "",
          cypher_query: data.cypher_query,
          results: data.results,
        },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", marginBottom: "0rem", textAlign: "center" }}>
      <h1>Movie Assistant</h1>

      <div
      //  style={{ maxWidth: 800, marginTop: 20 }}
       >
        <div
          style={{
            // border: "1px solid #ddd",
            padding: 4,
            height: 520,
            overflowY: "auto",
            background: "#2f2e2eff",
            borderRadius: 6,
          }}
        >
          {messages.length === 0 && <p style={{ color: "#666", marginTop: 0 }}>get info from the movie database</p>}

          {messages.map((m, idx) => (
            <div key={idx} style={{ marginBottom: 12, textAlign: m.role === "user" ? "right" : "left" }}>
              <div
                style={{
                  display: "inline-block",
                  background: m.role === "user" ? "#d1e7dd" : "#000",
                  padding: 3,
                  borderRadius: 8,
                  maxWidth: "100%",
                  boxShadow: "0 1px 2px #383838ff",
                }}
              >
                <div style={{ fontSize: 18, whiteSpace: "pre-wrap", padding:5 }}>{m.text}</div>

                {/* {m.cypher_query && (
                  <pre style={{ marginTop: 8, background: "#2f2e2eff", padding: 8, overflowX: "auto" }}>
                    {m.cypher_query}
                  </pre>
                )} */}

                {/* {m.results && (
                  <pre style={{ marginTop: 8, background: "#2f2e2eff", padding: 8, overflowX: "auto" }}>
                    {JSON.stringify(m.results, 2)}
                  </pre>
                )} */}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 8, marginBottom:0, display: "flex" }}>
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type your question..."
            style={{ flex: 1, padding: 2, border: "1px solid #ffffffff", borderRadius: 4 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                handleSubmit(e);
              }
            }}
          />
          <button type="submit" disabled={loading} style={{ marginLeft: 8, color: "beige", fontWeight: "900", fontSize:"18px", padding: "8px 12px", borderRadius:8 }}>
            {loading ? "..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;


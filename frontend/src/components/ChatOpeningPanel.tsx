import { useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getChatOpening, setChatOpening } from "../api/ops.api";
import { Panel, Pill } from "./ui";

// What the customer sees when they open the WhatsApp chat, before typing: up to 4 quick questions (Meta "ice
// breakers") and the welcome event, which makes the bot send the welcome and the options at once.
export default function ChatOpeningPanel() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["chatOpening"], queryFn: getChatOpening });
  const [edit, setEdit] = useState<string[] | null>(null);
  const current = q.data;
  const prompts = edit ?? (current?.prompts?.length ? current.prompts : (current?.defaults ?? []));
  const save = useMutation({
    mutationFn: () => setChatOpening(prompts.map((p) => p.trim()).filter(Boolean)),
    onSuccess: async () => {
      message.success("Saved on WhatsApp. New chats show these options before the customer types.");
      setEdit(null);
      await qc.invalidateQueries({ queryKey: ["chatOpening"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const set = (i: number, v: string) => {
    const next = [...prompts];
    next[i] = v;
    setEdit(next);
  };

  return (
    <Panel
      title="Chat opening on WhatsApp"
      note="What the customer sees when they open the chat, before they type"
    >
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        {q.isLoading ? (
          <span className="small muted">Reading from WhatsApp…</span>
        ) : current?.error ? (
          <Pill tone="warn">Could not read from WhatsApp: {current.error}</Pill>
        ) : (
          <>
            <Pill tone={current?.enable_welcome_message ? "ok" : "warn"}>
              Welcome message {current?.enable_welcome_message ? "on" : "off"}
            </Pill>
            <Pill tone={current?.prompts?.length ? "ok" : "warn"}>
              {current?.prompts?.length ?? 0} quick questions on WhatsApp
            </Pill>
          </>
        )}
      </div>
      <div className="small muted" style={{ marginBottom: 8 }}>
        Quick questions (up to 4, 80 characters each). A tap sends the text, and the bot answers it
        like the menu option of the same name. With the welcome message on, the bot sends the
        welcome and the options as soon as a new customer opens the chat.
      </div>
      <div className="grid g2" style={{ gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            className="input"
            maxLength={80}
            placeholder={`Quick question ${i + 1}`}
            value={prompts[i] ?? ""}
            onChange={(e) => set(i, e.target.value)}
          />
        ))}
      </div>
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn sm pri" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save on WhatsApp"}
        </button>
        {edit && (
          <button className="btn sm" onClick={() => setEdit(null)}>
            Undo changes
          </button>
        )}
      </div>
    </Panel>
  );
}

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getToken } from "../api/client";

// Live updates from the backend (server-sent events). An event names only what changed; the matching
// react-query data is refetched through the normal, permission-checked endpoints. Polling stays as the
// fallback when the stream is down.
const TOPIC_KEYS: Record<string, string[][]> = {
  message: [["conversations"], ["messages"]],
  conversation: [["conversations"], ["customerRecord"]],
  task: [["tasks"], ["privacyRequests"]],
  booking: [["bookings"]],
  activation: [["activations"]],
  crm: [["crm"]],
  follow_up: [["followUps"]],
  plan: [["planCatalog"], ["planChanges"]],
  template: [["templates"]],
  job: [["jobRuns"]],
};

export type LiveStatus = "connecting" | "live" | "offline";

/** Parses one SSE block ("event: change\ndata: {...}") */
export function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

export function useLiveUpdates(enabled: boolean): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    let wait = 2000;
    let stopped = false;

    const onEvent = (e: { topic?: string; conversation_id?: string | null }) => {
      for (const key of TOPIC_KEYS[e.topic ?? ""] ?? [])
        void queryClient.invalidateQueries({ queryKey: key });
      if (e.topic === "message")
        void queryClient.invalidateQueries({
          queryKey: e.conversation_id ? ["messages", e.conversation_id] : ["messages"],
        });
    };

    const run = async () => {
      while (!stopped) {
        try {
          setStatus("connecting");
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/Console/Live`, {
            headers: { Authorization: `Bearer ${getToken() ?? ""}`, Accept: "text/event-stream" },
            signal: ctrl.signal,
          });
          // the backend answers errors (e.g. Unauthorized) with HTTP 200 + JSON: only a real stream counts
          if (
            !res.ok ||
            !res.body ||
            !(res.headers.get("content-type") ?? "").includes("text/event-stream")
          )
            throw new Error(`HTTP ${res.status}`);
          setStatus("live");
          wait = 2000;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let i: number;
            while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
              const block = buf.slice(0, i);
              buf = buf.slice(i).replace(/^\r?\n\r?\n/, "");
              const ev = parseSseBlock(block);
              if (ev?.event === "change") onEvent(ev.data as never);
            }
          }
        } catch {
          if (stopped) return;
        }
        setStatus("offline");
        await new Promise((r) => setTimeout(r, wait));
        wait = Math.min(wait * 2, 30_000);
      }
    };
    void run();
    return () => {
      stopped = true;
      ctrl.abort();
    };
  }, [enabled, queryClient]);

  return enabled ? status : "offline";
}

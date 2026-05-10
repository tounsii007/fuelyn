// ============================================================
// /ai-chat — Conversational fuel/charging assistant.
//
// Full-bleed chat surface mounted at /ai-chat. Wraps the
// existing AppShell so the header + nav stay consistent with
// the rest of the app.
// ============================================================

import { ChatInterface } from '@/components/ai/ChatInterface';
import { AppShell } from '@/components/layout/AppShell';

export default function AiChatPage() {
  return (
    <AppShell>
      <div className="h-full">
        <ChatInterface />
      </div>
    </AppShell>
  );
}

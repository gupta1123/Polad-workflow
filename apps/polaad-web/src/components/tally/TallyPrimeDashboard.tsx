"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  FileText,
  Loader2,
  PlugZap,
  RefreshCw,
  Server,
  Terminal,
  TriangleAlert,
} from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TallyConnection = {
  id: string;
  displayName: string;
  status: string;
  tallyUrl: string;
  pairingCodeExpiresAt: string | null;
  pairedAt: string | null;
  bridgeName: string | null;
  bridgeVersion: string | null;
  bridgeMachineId: string | null;
  lastHeartbeatAt: string | null;
  lastTestedAt: string | null;
  lastTallyReachable: boolean | null;
  lastCompanyLoaded: boolean | null;
  lastCompanyName: string | null;
  lastError: string | null;
  bridgeConnected?: boolean;
  tallyReachable?: boolean;
  companyLoaded?: boolean;
  heartbeatStale?: boolean;
};

type ConnectionsResponse = {
  connections?: TallyConnection[];
  error?: string;
};

type CreateConnectionResponse = {
  connection?: TallyConnection;
  pairingCode?: string;
  error?: string;
};

type StatusResponse = {
  connection?: TallyConnection;
  error?: string;
};

async function readError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error || `Request failed with status ${response.status}`;
}

function formatTime(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusLabel(connection?: TallyConnection | null) {
  if (!connection) return "Not connected";
  if (connection.status === "company_loaded") return "Company loaded";
  if (connection.status === "tally_reachable") return "Tally reachable";
  if (connection.status === "bridge_connected") return "Connector connected";
  if (connection.status === "connection_error") return "Connection error";
  if (connection.status === "waiting_for_bridge") return "Waiting for connector";
  return "Not connected";
}

function getStatusTone(connection?: TallyConnection | null) {
  if (!connection) return "neutral";
  if (connection.status === "company_loaded") return "success";
  if (connection.status === "tally_reachable" || connection.status === "bridge_connected") return "warning";
  if (connection.status === "connection_error") return "error";
  return "neutral";
}

function getBridgeApiBaseUrl() {
  const configuredBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configuredBaseUrl) return configuredBaseUrl;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3001";
}

function escapeCommandValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildPairCommand(connection: TallyConnection, pairingCode: string) {
  const apiBaseUrl = getBridgeApiBaseUrl();
  return `npm.cmd run pair -- --api-base "${apiBaseUrl}" --connection-id "${connection.id}" --pairing-code "${pairingCode}"`;
}

function buildStartCommand(connection?: TallyConnection | null) {
  const companyFlag = connection?.lastCompanyName
    ? ` -- --company-name "${escapeCommandValue(connection.lastCompanyName)}"`
    : "";

  return `npm.cmd run start${companyFlag}`;
}

function StatusCard({
  title,
  value,
  ok,
  detail,
}: {
  title: string;
  value: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-[#e5ddd0] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8a7f72]">
            {title}
          </div>
          <div className="mt-2 text-sm font-bold text-[#1a1a1a]">{value}</div>
          <div className="mt-1 text-xs font-medium text-[#8a7f72]">{detail}</div>
        </div>
        {ok ? (
          <CheckCircle2 className="h-5 w-5 text-[#059669]" />
        ) : (
          <TriangleAlert className="h-5 w-5 text-[#d97706]" />
        )}
      </div>
    </div>
  );
}

function CommandBlock({
  title,
  command,
  onCopy,
}: {
  title: string;
  command: string;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#e3d6c6] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-[#1a1a1a]">
          <Terminal className="h-4 w-4 text-[#8a7f72]" />
          {title}
        </div>
        <Button
          className="h-9 rounded-lg border-[#e5ddd0] bg-white px-3 text-[#1a1a1a] hover:bg-[#f3eee7]"
          onClick={() => onCopy(command)}
          type="button"
          variant="outline"
        >
          <Clipboard className="h-4 w-4" />
          Copy
        </Button>
      </div>
      <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-[#1a1a1a] px-3 py-3 font-mono text-xs font-semibold text-white">
        {command}
      </code>
    </div>
  );
}

function HubCard({
  title,
  description,
  status,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  status: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="group flex min-h-[190px] w-full flex-col justify-between rounded-xl border border-[#e5ddd0] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#d8ccbc] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/20"
      onClick={onClick}
      type="button"
    >
      <div>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#1a1a1a] text-white">
            {icon}
          </div>
          <ArrowRight className="h-5 w-5 text-[#8a7f72] transition group-hover:translate-x-1 group-hover:text-[#1a1a1a]" />
        </div>
        <h3 className="text-lg font-black text-[#1a1a1a]">{title}</h3>
        <p className="mt-2 max-w-md text-sm font-medium leading-6 text-[#756a5f]">{description}</p>
      </div>
      <div className="mt-6 w-fit rounded-full border border-[#e5ddd0] bg-[#fafafa] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#8a7f72]">
        {status}
      </div>
    </button>
  );
}

export function TallyPrimeDashboard() {
  const router = useRouter();
  const [view, setView] = useState<"home" | "connection">("home");
  const [connections, setConnections] = useState<TallyConnection[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const selectedConnection =
    connections.find((connection) => connection.id === selectedId) ?? connections[0] ?? null;
  const statusTone = getStatusTone(selectedConnection);
  const pairCommand = useMemo(() => {
    if (!selectedConnection || !pairingCode) return "";
    return buildPairCommand(selectedConnection, pairingCode);
  }, [pairingCode, selectedConnection]);
  const startCommand = useMemo(() => buildStartCommand(selectedConnection), [selectedConnection]);

  async function loadConnections(options?: { quiet?: boolean }) {
    try {
      if (!options?.quiet) {
        setLoading(true);
      }
      const response = await apiFetch("/api/tally/connections", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as ConnectionsResponse;
      const nextConnections = payload.connections ?? [];
      setConnections(nextConnections);
      setSelectedId((current) =>
        nextConnections.some((connection) => connection.id === current)
          ? current
          : nextConnections[0]?.id || ""
      );
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to load Tally connections.",
      });
    } finally {
      setLoading(false);
    }
  }

  const refreshStatus = useCallback(async (connectionId: string) => {
    if (!connectionId) return;

    try {
      const response = await apiFetch(`/api/tally/connections/${connectionId}/status`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as StatusResponse;
      if (!payload.connection) return;

      setConnections((current) =>
        current.map((connection) =>
          connection.id === payload.connection?.id ? payload.connection : connection
        )
      );
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to refresh Tally status.",
      });
    }
  }, []);

  async function createConnection() {
    try {
      setCreating(true);
      setMessage(null);
      const response = await apiFetch("/api/tally/connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: "Tally Prime",
          tallyUrl: "http://localhost:9000",
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as CreateConnectionResponse;
      if (!payload.connection || !payload.pairingCode) {
        throw new Error("Connection created, but pairing details were missing.");
      }

      setConnections((current) => [payload.connection as TallyConnection, ...current]);
      setSelectedId(payload.connection.id);
      setPairingCode(payload.pairingCode);
      setMessage({
        tone: "success",
        text: "Connection created. Copy the pair command below.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to create Tally connection.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function requestTest() {
    if (!selectedConnection) return;

    try {
      setTesting(true);
      setMessage(null);
      const response = await apiFetch(`/api/tally/connections/${selectedConnection.id}/test`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as StatusResponse;
      if (payload.connection) {
        setConnections((current) =>
          current.map((connection) =>
            connection.id === payload.connection?.id ? payload.connection : connection
          )
        );
      }

      setMessage({
        tone: "success",
        text: "Connection checked.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to test Tally connection.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage({ tone: "success", text: "Command copied." });
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    if (!selectedConnection) return;
    const timer = window.setInterval(() => {
      void refreshStatus(selectedConnection.id);
    }, 10_000);

    return () => window.clearInterval(timer);
  }, [refreshStatus, selectedConnection]);

  if (view === "home") {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-black tracking-tight text-[#1a1a1a]">Tally Prime</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-[#8a7f72]">
            Choose what you want to work on.
          </p>
        </div>

        {message ? (
          <div
            className={`mb-6 rounded-xl border px-4 py-3 text-sm font-medium ${
              message.tone === "success"
                ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
                : "border-[#ef4444]/20 bg-[#fff1f2] text-[#b91c1c]"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <HubCard
            description="Set up or check the Tally connector."
            icon={<Server className="h-5 w-5" />}
            onClick={() => setView("connection")}
            status={loading ? "Checking" : getStatusLabel(selectedConnection)}
            title="Tally Connection"
          />
          <HubCard
            description="Import, review, and post bank statement entries."
            icon={<FileText className="h-5 w-5" />}
            onClick={() => router.push("/bank-statements")}
            status="Open"
            title="Bank Statement"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col overflow-y-auto">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button
            className="mb-3 flex items-center gap-2 text-sm font-bold text-[#756a5f] hover:text-[#1a1a1a]"
            onClick={() => setView("home")}
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h2 className="text-xl font-black tracking-tight text-[#1a1a1a]">Tally Connection</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-[#8a7f72]">
            Connect Tally Prime to post bank statement entries.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
            disabled={loading}
            onClick={() => void loadConnections()}
            type="button"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            className="rounded-xl bg-[#1a1a1a] px-5 font-bold text-white"
            disabled={creating}
            onClick={() => void createConnection()}
            type="button"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            New Connection
          </Button>
        </div>
      </div>

      {message ? (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm font-medium ${
            message.tone === "success"
              ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
              : "border-[#ef4444]/20 bg-[#fff1f2] text-[#b91c1c]"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-[#f3eee7]" />
          ))}
        </div>
      ) : selectedConnection ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a1a] text-white">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-[#1a1a1a]">{selectedConnection.displayName}</h3>
                    <Badge
                      className={
                        statusTone === "success"
                          ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
                          : statusTone === "error"
                            ? "border-[#ef4444]/20 bg-[#fff1f2] text-[#b91c1c]"
                            : statusTone === "warning"
                              ? "border-[#f59e0b]/20 bg-[#fff7e6] text-[#a16207]"
                              : "border-[#e5ddd0] bg-white text-[#8a7f72]"
                      }
                      variant="outline"
                    >
                      {getStatusLabel(selectedConnection)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium text-[#8a7f72]">
                    {selectedConnection.lastCompanyName || "Company not detected yet"}
                  </div>
                </div>
              </div>

              <Button
                className="w-fit rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                disabled={testing}
                onClick={() => void requestTest()}
                type="button"
                variant="outline"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Test Connection
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatusCard
              detail={`Last seen: ${formatTime(selectedConnection.lastHeartbeatAt)}`}
              ok={Boolean(selectedConnection.bridgeConnected)}
              title="Connector"
              value={selectedConnection.bridgeConnected ? "Connected" : "Waiting"}
            />
            <StatusCard
              detail={`Last checked: ${formatTime(selectedConnection.lastTestedAt)}`}
              ok={selectedConnection.lastTallyReachable === true}
              title="Tally"
              value={selectedConnection.lastTallyReachable ? "Reachable" : "Not reachable"}
            />
            <StatusCard
              detail={selectedConnection.lastCompanyName || selectedConnection.lastError || "Open Tally Prime"}
              ok={selectedConnection.lastCompanyLoaded === true}
              title="Company"
              value={selectedConnection.lastCompanyLoaded ? "Loaded" : "Not detected"}
            />
          </div>

          <section className="rounded-xl border border-[#e5ddd0] bg-[#fffaf2] p-5 shadow-sm">
            <div className="mb-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8a7f72]">
                Setup
              </div>
              <h3 className="mt-2 text-base font-black text-[#1a1a1a]">Copy and run these commands</h3>
              <p className="mt-1 max-w-2xl text-sm font-medium text-[#6f6256]">
                Run them on the computer where Tally Prime is installed.
              </p>
            </div>

            <div className="space-y-3">
              {pairCommand ? (
                <CommandBlock command={pairCommand} onCopy={(value) => void copyText(value)} title="1. Pair connector" />
              ) : (
                <div className="rounded-xl border border-[#e3d6c6] bg-white px-4 py-3 text-sm font-semibold text-[#7c6f62]">
                  Create a new connection to get the pair command.
                </div>
              )}
              <CommandBlock command={startCommand} onCopy={(value) => void copyText(value)} title="2. Start connector" />
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-[#d8ccbc] bg-[#fafafa] p-8 text-center">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#1a1a1a] text-white">
              <PlugZap className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-black text-[#1a1a1a]">No Tally connection yet</h3>
            <p className="mt-1 max-w-md text-sm font-medium text-[#8a7f72]">
              Create a connection to get the setup commands.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

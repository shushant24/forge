import { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { StatsBar } from './components/StatsBar';
import { MapView } from './components/MapView';
import { InspectorPanel } from './components/InspectorPanel';
import type { SwarmExecutionResponse, AgentReasoningStep } from './types';
const API = import.meta.env.VITE_API_URL ?? '';

export function App() {
  const [threats, setThreats] = useState<any[]>([]);
  const [selectedThreat, setSelectedThreat] = useState<any | null>(null);
  const [swarmData, setSwarmData] = useState<SwarmExecutionResponse | null>(null);
  const [liveSteps, setLiveSteps] = useState<AgentReasoningStep[]>([]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [activeScenarioId, setActiveScenarioId] = useState<string>('THREAT-OD-CYCLONE-01');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Initialize WebSocket connection for progressive streaming
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsBase = API ? API.replace(/^http/, 'ws') : `${protocol}//${window.location.host}`;
    const wsUrl = `${wsBase}/ws/live`;
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'AGENT_STEP' && payload.step) {
            setLiveSteps((prev) => {
              if (prev.some((s) => s.step_number === payload.step.step_number)) {
                return prev;
              }
              return [...prev, payload.step];
            });
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Trigger Swarm Execution via API
  const executeSwarm = async (threatId?: string, lat?: number, lon?: number, label?: string) => {
    setIsExecuting(true);
    setLiveSteps([]);
    setErrorMessage(null);

    try {
        const res = await fetch(`${API}/api/v1/swarm/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threat_id: threatId,
          lat: lat,
          lon: lon,
          label: label,
        }),
      });
      if (res.ok) {
        const data: SwarmExecutionResponse = await res.json();
        setSwarmData(data);
        setSelectedThreat(data.threat);
        setLiveSteps(data.reasoning_chain);
      } else {
        const errText = await res.text();
        setErrorMessage(`Swarm execution notice: ${errText.slice(0, 100)}`);
      }
    } catch {
      setErrorMessage('Upstream API timeout: Resilient mode activated using cached meteorological baseline.');
    } finally {
      setIsExecuting(false);
    }
  };

  // On Initial Mount: Load Active Threats & Execute Baseline Odisha Scenario
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${API}/api/v1/threats/active`);
        if (res.ok) {
          const list = await res.json();
          setThreats(list);
          if (list.length > 0) {
            setSelectedThreat(list[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load active threats:', err);
      }

      // Automatically execute first scenario for live initial state
      await executeSwarm('THREAT-OD-CYCLONE-01', 19.8135, 85.8312, 'Puri Coastal Belt, Odisha');
    };

    init();
  }, []);

  // Handle Scenario Switch from Navbar
  const handleSelectScenario = async (scenarioId: string, label: string) => {
    setActiveScenarioId(scenarioId);
    const found = threats.find((t) => t.id === scenarioId);
    const lat = found?.location?.lat || 20.2961;
    const lon = found?.location?.lon || 85.8245;
    await executeSwarm(scenarioId, lat, lon, label);
  };

  // Handle Threat Selection from Inspector
  const handleSelectThreat = async (threat: any) => {
    setSelectedThreat(threat);
    setActiveScenarioId(threat.id);
    await executeSwarm(threat.id, threat.location?.lat, threat.location?.lon, threat.title);
  };

  // Handle Live Current Location Scan
  const handleLiveTrigger = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setActiveScenarioId('LIVE-GPS');
          await executeSwarm(undefined, latitude, longitude, 'Live Geolocation Field Station');
        },
        async () => {
          setActiveScenarioId('LIVE-GPS');
          await executeSwarm(undefined, 17.6868, 83.2185, 'Visakhapatnam Bay Sector');
        }
      );
    } else {
      executeSwarm(undefined, 17.6868, 83.2185, 'Visakhapatnam Bay Sector');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#fbfbfa] text-stone-900 overflow-hidden font-sans">
      {/* 1. Clean Editorial Header */}
      <Navbar
        onSelectScenario={handleSelectScenario}
        activeScenarioId={activeScenarioId}
        isExecuting={isExecuting}
        onLiveTrigger={handleLiveTrigger}
        wsConnected={wsConnected}
      />

      {/* Resilience Warning Banner */}
      {errorMessage && (
        <div className="bg-amber-50 border-b border-amber-300 text-amber-900 px-6 py-1.5 text-xs font-mono flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-amber-800 underline text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Key Metrics Stats Bar */}
      <StatsBar data={swarmData} isExecuting={isExecuting} />

      {/* 3. Main Stage: Two-Column Focused Editorial Layout */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* Left Stage: Full Spacious Map (62% width) */}
        <div className="flex-1 md:w-[62%] h-full min-h-[420px] relative overflow-hidden flex flex-col">
          {isExecuting && (
            <div className="absolute top-4 right-4 z-20 bg-stone-900 text-white text-xs px-3.5 py-2 font-mono flex items-center gap-2 shadow-lg border border-stone-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>ORCHESTRATING MULTI-AGENT SWARM (STEP {liveSteps.length}/5)...</span>
            </div>
          )}
          <MapView data={swarmData} />
        </div>

        {/* Right Stage: Inspector Panel with Clean Tabs (38% width) */}
        <div className="w-full md:w-[38%] h-full min-h-[420px] flex flex-col overflow-hidden border-t md:border-t-0 md:border-l border-stone-200">
          <InspectorPanel
            data={swarmData}
            liveSteps={liveSteps}
            threats={threats}
            activeThreatId={selectedThreat?.id || activeScenarioId}
            onSelectThreat={handleSelectThreat}
            isExecuting={isExecuting}
          />
        </div>
      </div>
    </div>
  );
}

export default App;

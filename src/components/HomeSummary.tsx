import { useEffect, useState } from 'react';
import { Boxes, CloudCog, Users } from 'lucide-react';
import { GlassCard } from './ui';
import { getMyOwnedTeam, getMyMembership } from '../lib/teams';
import type { CloudClient } from '../lib/cloudClient';
import type { Workspace } from '../types';

export function HomeSummary({ workspaces, cc }: { workspaces: Workspace[]; cc: CloudClient }) {
  const [teamName, setTeamName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const owned = await getMyOwnedTeam();
      if (owned) { setTeamName(owned.name); return; }
      const membership = await getMyMembership();
      setTeamName(membership?.team.name ?? null);
    })();
  }, []);

  const latestFile = cc.files[0];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <GlassCard className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
          <Boxes className="text-accent" size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink leading-none">{workspaces.length}</p>
          <p className="text-[11px] text-ink-faint mt-0.5">Workspace{workspaces.length === 1 ? '' : 's'}</p>
        </div>
      </GlassCard>

      <GlassCard className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
          <CloudCog className="text-accent" size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink leading-none truncate">{latestFile ? latestFile.name : 'No files yet'}</p>
          <p className="text-[11px] text-ink-faint mt-0.5">Latest cloud file</p>
        </div>
      </GlassCard>

      <GlassCard className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
          <Users className="text-accent" size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink leading-none truncate">{teamName || 'No team'}</p>
          <p className="text-[11px] text-ink-faint mt-0.5">Team</p>
        </div>
      </GlassCard>
    </div>
  );
}

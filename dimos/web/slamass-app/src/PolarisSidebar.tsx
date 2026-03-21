import React, { useId, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  TransitionChild,
} from "@headlessui/react";
import {
  CalendarIcon,
  ChartPieIcon,
  ChevronDownIcon,
  CubeIcon,
  DocumentDuplicateIcon,
  FolderIcon,
  PlusIcon,
  SparklesIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  name: string;
  href: string;
  icon: Icon;
  current: boolean;
};

type TeamItem = {
  id: number;
  name: string;
  href: string;
  initial: string;
  current: boolean;
};

const navigation: NavItem[] = [
  { name: "Team", href: "#", icon: UsersIcon, current: true },
  { name: "Projects", href: "#", icon: FolderIcon, current: false },
  { name: "Calendar", href: "#", icon: CalendarIcon, current: false },
  { name: "Documents", href: "#", icon: DocumentDuplicateIcon, current: false },
  { name: "Reports", href: "#", icon: ChartPieIcon, current: false },
];

const teams: TeamItem[] = [
  { id: 1, name: "Heroicons", href: "#", initial: "H", current: false },
  { id: 2, name: "Tailwind Labs", href: "#", initial: "T", current: false },
  { id: 3, name: "Workcation", href: "#", initial: "W", current: false },
];

function PolarisSidebarNav(): React.ReactElement {
  const teamSectionId = useId();
  const [teamExpanded, setTeamExpanded] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<number>(teams[0]!.id);

  return (
    <nav aria-label="Sidebar" className="polaris-sidebar-glass-nav">
      <div className="polaris-sidebar-glass-brand">Polaris</div>

      <ul className="polaris-sidebar-glass-list" role="list">
        <li>
          <a
            className="polaris-sidebar-glass-row"
            data-testid="polaris-sidebar-operators"
            href="#"
          >
            <CubeIcon aria-hidden="true" className="polaris-sidebar-glass-icon" />
            <span className="polaris-sidebar-glass-label">Operators</span>
          </a>
        </li>
        <li>
          <a
            className="polaris-sidebar-glass-row"
            data-testid="polaris-sidebar-abilities"
            href="#"
          >
            <SparklesIcon aria-hidden="true" className="polaris-sidebar-glass-icon" />
            <span className="polaris-sidebar-glass-label">Abilities</span>
          </a>
        </li>

        <li>
          <button
            aria-controls={teamSectionId}
            aria-expanded={teamExpanded}
            className={`polaris-sidebar-glass-row polaris-sidebar-glass-row--expand${teamExpanded ? " polaris-sidebar-glass-row--invert" : ""}`}
            onClick={() => setTeamExpanded((e) => !e)}
            type="button"
          >
            <UsersIcon aria-hidden="true" className="polaris-sidebar-glass-icon" />
            <span className="polaris-sidebar-glass-label">Team</span>
            <ChevronDownIcon
              aria-hidden="true"
              className={`polaris-sidebar-glass-chevron${teamExpanded ? " polaris-sidebar-glass-chevron--open" : ""}`}
            />
          </button>
          {teamExpanded ? (
            <ul className="polaris-sidebar-glass-nested" id={teamSectionId} role="list">
              {teams.map((t) => (
                <li key={t.id}>
                  <a
                    className={`polaris-sidebar-glass-nested-link${selectedTeamId === t.id ? " polaris-sidebar-glass-nested-link--active" : ""}`}
                    href={t.href}
                    onClick={() => setSelectedTeamId(t.id)}
                  >
                    {t.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </li>

        {navigation
          .filter((n) => n.name !== "Team")
          .map((item) => (
            <li key={item.name}>
              <a className="polaris-sidebar-glass-row" href={item.href}>
                <item.icon aria-hidden="true" className="polaris-sidebar-glass-icon" />
                <span className="polaris-sidebar-glass-label">{item.name}</span>
                {item.name === "Projects" || item.name === "Reports" ? (
                  <PlusIcon aria-hidden="true" className="polaris-sidebar-glass-suffix" />
                ) : null}
              </a>
            </li>
          ))}
      </ul>

      <div className="polaris-sidebar-glass-profile">
        <a className="polaris-sidebar-glass-profile-link" href="#">
          <span className="polaris-sidebar-glass-profile-avatar" aria-hidden="true">
            TC
          </span>
          <span className="sr-only">Your profile</span>
          <span aria-hidden="true">Tom Cook</span>
        </a>
      </div>
    </nav>
  );
}

export type PolarisSidebarsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PolarisSidebars({
  open,
  onOpenChange,
}: PolarisSidebarsProps): React.ReactElement {
  return (
    <Dialog
      className="relative z-50"
      onClose={onOpenChange}
      open={open}
      transition
    >
      <DialogBackdrop className="polaris-sidebar-backdrop" transition />

      <div className="fixed inset-0 flex">
        <DialogPanel className="polaris-sidebar-panel-shell" transition>
          <TransitionChild transition>
            <div className="polaris-sidebar-close-slot">
              <button
                className="polaris-sidebar-close"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                <span className="sr-only">Close sidebar</span>
                <XMarkIcon aria-hidden="true" />
              </button>
            </div>
          </TransitionChild>

          <div className="polaris-sidebar-panel polaris-sidebar-panel--glass">
            <PolarisSidebarNav />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

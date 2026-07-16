import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useTheme } from './ThemeProvider';
import { ArrowLeft, PanelLeft, Menu } from 'lucide-react';
import { SearchDropdown } from './SearchDropdown';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb';
import { getEvidenceByCaseId } from '../data/mockEvidence';
import { getContextGraph } from '../storage/config';
import { useIsMobile } from './ui/use-mobile';
import svgPaths from '../imports/svg-d29d82xyuv';
import assistantIcon from '../assets/assistant-icon.svg';

interface Crumb { label: string; href?: string; }

function useBreadcrumbs(): Crumb[] {
  const { pathname } = useLocation();
  const segs = pathname.split('/').filter(Boolean);

  if (segs.length === 0 || segs[0] === 'home') return [{ label: 'Home' }];

  if (segs[0] === 'evidence') {
    if (segs[1] === 'item' && segs[2]) {
      const graph = getContextGraph();
      const node = graph?.nodes?.[segs[2]];
      return [
        { label: 'Evidence', href: '/evidence' },
        { label: node?.title ?? 'Evidence Detail' },
      ];
    }
    if (segs.length === 3) {
      const evidence = getEvidenceByCaseId(segs[1])[parseInt(segs[2])];
      return [
        { label: 'Evidence', href: '/evidence' },
        { label: evidence?.title ?? `Evidence ${parseInt(segs[2]) + 1}` },
      ];
    }
    return [{ label: 'Evidence' }];
  }

  if (segs[0] === 'cases') {
    if (segs.length === 1) return [{ label: 'Cases' }];
    if (segs.length === 2) return [{ label: 'Cases', href: '/cases' }, { label: segs[1] }];
    if (segs.length === 4 && segs[2] === 'evidence') {
      const evidence = getEvidenceByCaseId(segs[1])[parseInt(segs[3])];
      return [
        { label: 'Cases', href: '/cases' },
        { label: segs[1], href: `/cases/${segs[1]}` },
        { label: evidence?.title ?? `Evidence ${parseInt(segs[3]) + 1}` },
      ];
    }
  }

  if (segs[0] === 'search' && segs[1] === 'evidence' && segs[2]) {
    const graph = getContextGraph();
    const node = graph?.nodes?.[segs[2]];
    return [{ label: node?.title ?? 'Evidence Detail' }];
  }

  if (segs[0] === 'search') return [{ label: 'Search Results' }];

  const label = segs[0].charAt(0).toUpperCase() + segs[0].slice(1);
  return [{ label }];
}

interface UtilityBarProps {
  title: string;
  showBackButton?: boolean;
  onBack?: () => void;
  showSidebarToggle?: boolean;
  sidebarVisible?: boolean;
  onSidebarToggle?: () => void;
  actions?: React.ReactNode;
  onOpenSearch: (query: string, selectedId?: string, output?: import('../data/types').SearchOutput) => void;
  onOpenAssistant: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center justify-center p-2 transition-all cursor-pointer rounded-sm"
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--fill-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      title="Go back"
    >
      <ArrowLeft size={20} style={{ color: 'var(--foreground)' }} />
    </button>
  );
}

function SidebarToggle({ sidebarVisible, onSidebarToggle }: { sidebarVisible: boolean; onSidebarToggle: () => void }) {
  const isMobile = useIsMobile();
  
  return (
    <button
      onClick={onSidebarToggle}
      className="flex items-center justify-center p-2 hover:opacity-70 transition-opacity cursor-pointer"
      title={isMobile ? "Toggle menu" : (sidebarVisible ? "Hide sidebar" : "Show sidebar")}
    >
      {isMobile ? (
        <Menu 
          size={20} 
          style={{ 
            color: 'var(--foreground)'
          }} 
        />
      ) : (
        <PanelLeft 
          size={20} 
          style={{ 
            color: 'var(--foreground)',
            opacity: sidebarVisible ? 1 : 0.6 
          }} 
        />
      )}
    </button>
  );
}


function LeftSection({
  showBackButton,
  onBack,
  showSidebarToggle,
  sidebarVisible,
  onSidebarToggle
}: {
  showBackButton?: boolean;
  onBack?: () => void;
  showSidebarToggle?: boolean;
  sidebarVisible?: boolean;
  onSidebarToggle?: () => void;
}) {
  const crumbs = useBreadcrumbs();

  return (
    <div className="flex items-center gap-2.5 h-full px-2" data-name="left section">
      {showSidebarToggle && onSidebarToggle && (
        <SidebarToggle sidebarVisible={sidebarVisible || false} onSidebarToggle={onSidebarToggle} />
      )}
      <Breadcrumb>
        <BreadcrumbList style={{ fontSize: 15, fontWeight: 500 }}>
          {crumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {crumb.href
                  ? <BreadcrumbLink asChild><Link to={crumb.href} style={{ fontSize: 15, fontWeight: 500 }}>{crumb.label}</Link></BreadcrumbLink>
                  : <BreadcrumbPage style={{ fontSize: 15, fontWeight: 500 }}>{crumb.label}</BreadcrumbPage>
                }
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

function AieraIcon({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative shrink-0 size-6 cursor-pointer hover:opacity-70 transition-opacity" title="Aiera" onClick={onClick}>
      <img src={assistantIcon} alt="Assistant" className="block size-full" />
    </div>
  );
}

function QuestionFill() {
  return (
    <div className="relative shrink-0 size-6 cursor-pointer hover:opacity-70 transition-opacity" data-name="question-fill">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="question-fill">
          <path d={svgPaths.p36268b00} fill="var(--foreground)" fillOpacity="0.8" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function MailFill() {
  return (
    <div className="relative shrink-0 size-6 cursor-pointer hover:opacity-70 transition-opacity" data-name="mail-fill">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="mail-fill">
          <path d={svgPaths.p19c51c70} fill="var(--foreground)" fillOpacity="0.8" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function Theme() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <div 
      className="relative shrink-0 size-5 cursor-pointer hover:opacity-70 transition-opacity" 
      data-name="theme"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 20">
        <g id="theme">
          <path d={svgPaths.p2f5b3800} fill="var(--foreground)" fillOpacity="0.8" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function Button2() {
  return (
    <div className="flex" data-name="button">
      <Theme />
    </div>
  );
}

function ButtonIconMode() {
  return (
    <div className="flex" data-name="Button - IconMode">
      <Button2 />
    </div>
  );
}


export function UtilityIcons({ onOpenAssistant }: { onOpenAssistant: () => void }) {
  const isMobile = useIsMobile();

  return (
    <div className="flex gap-3 items-center" data-name="utility-icons">
      {!isMobile && <AieraIcon onClick={onOpenAssistant} />}
      {!isMobile && <QuestionFill />}
      {!isMobile && <MailFill />}
      <ButtonIconMode />
    </div>
  );
}

function RightSection({ onOpenAssistant }: { onOpenAssistant: () => void }) {
  return (
    <div className="flex" data-name="right section">
      <UtilityIcons onOpenAssistant={onOpenAssistant} />
    </div>
  );
}

export function UtilityBar({
  title,
  showBackButton,
  onBack,
  showSidebarToggle,
  sidebarVisible,
  onSidebarToggle,
  actions,
  onOpenSearch,
  onOpenAssistant,
  searchInputRef,
}: UtilityBarProps) {
  const isMobile = useIsMobile();

  return (
    <div
      className="relative size-full"
      data-name="utility"
      style={{ backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)', height: 48 }}
    >
      <div className="flex flex-row items-center min-w-inherit relative size-full">
        <div className="box-border content-stretch flex items-center min-w-inherit px-6 relative size-full gap-4" style={{ paddingTop: 10, paddingBottom: 10 }}>
          <LeftSection
            showBackButton={showBackButton}
            onBack={onBack}
            showSidebarToggle={showSidebarToggle}
            sidebarVisible={sidebarVisible}
            onSidebarToggle={onSidebarToggle}
          />
          <div className="flex-1" />
          <div className="flex items-center gap-4 shrink-0">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
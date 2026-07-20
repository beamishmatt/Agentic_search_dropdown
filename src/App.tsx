import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './components/ThemeProvider';
import { ActionBarProvider } from './components/ActionBarProvider';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from './components/ui/sonner';
import { ConfigurableSidebar, NavigationIcons, NavItem } from './components/ConfigurableSidebar';
import { UtilityBar } from './components/UtilityBar';
import { CustomLogo } from './components/CustomLogo';
import { EvidencePage } from './components/pages/EvidencePage';
import { CasesPage } from './components/pages/CasesPage';
import { CaseDetailPage } from './components/pages/CaseDetailPage';
import { EvidenceDetailPage } from './components/pages/EvidenceDetailPage';
import { SearchEvidenceDetailPage } from './components/pages/SearchEvidenceDetailPage';
import { CommunityPage } from './components/pages/CommunityPage';
import { DevicesPage } from './components/pages/DevicesPage';
import { AnalyticsPage } from './components/pages/AnalyticsPage';
import { HomePage } from './components/pages/HomePage';
import { ImportModal } from './components/ImportModal';
import { getEvidenceByCaseId } from './data/mockEvidence';
import { useIsMobile } from './components/ui/use-mobile';
import { SearchTakeover } from './components/SearchTakeover';
import { ChatDrawer, ChatMessage, parseThinkingFromRaw, parseNeedsEvidence } from './components/pages/HomePage';
import { chatWithEvidenceStream, ChatMessage as EngineChatMessage } from './engine/assistantChat';
import { parseDraft } from './utils/draftUtils';
import { stripActionTags, ToolCall } from './components/AssistantPanel';
import { PasswordGate } from './components/PasswordGate';
import { SearchDropdown } from './components/SearchDropdown';
import { UtilityIcons } from './components/UtilityBar';
import { Plus, Home } from 'lucide-react';
import EvidenceIcon from './imports/EvidenceIcon';
import CasesIcon from './imports/CasesIcon';
import CommunityIcon from './imports/CommunityIcon';
import DevicesIcon from './imports/DevicesIcon';
import AnalyticsIcon from './imports/AnalyticsIcon';

// Define your navigation items here - add or remove items as needed
const navigationItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home size={24} />, path: '/home' },
  { id: 'evidence', label: 'Evidence', icon: <div style={{ width: 24, height: 24 }}><EvidenceIcon /></div>, path: '/evidence' },
  { id: 'cases', label: 'Cases', icon: <div style={{ width: 24, height: 24 }}><CasesIcon /></div>, path: '/cases' },
  { id: 'community', label: 'Community', icon: <div style={{ width: 24, height: 24 }}><CommunityIcon /></div>, path: '/community' },
  { id: 'devices', label: 'Devices', icon: <div style={{ width: 24, height: 24 }}><DevicesIcon /></div>, path: '/devices' },
  { id: 'analytics', label: 'Analytics', icon: <div style={{ width: 24, height: 24 }}><AnalyticsIcon /></div>, path: '/analytics' },
];

// Define your header icon here - easily swappable
const headerIcon = <CustomLogo size={32} />;

function TopRailSearch({
  onOpenSearch,
  searchInputRef,
  query,
  onQueryChange,
  resultCount,
  onReopenSearch,
  onClearResults,
  onAiMode,
}: {
  onOpenSearch: (query: string, selectedId?: string, output?: import('./data/types').SearchOutput) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  query: string;
  onQueryChange: (q: string) => void;
  resultCount: number;
  onReopenSearch: () => void;
  onClearResults: () => void;
  onAiMode: () => void;
}) {
  const localRef = React.useRef<HTMLInputElement>(null);
  return (
    <SearchDropdown
      inputRef={searchInputRef ?? localRef}
      query={query}
      onQueryChange={onQueryChange}
      onClose={() => {}}
      onOpenSearch={onOpenSearch}
      resultCount={resultCount}
      onResultTagClick={onReopenSearch}
      onClearResults={onClearResults}
      onAiMode={onAiMode}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <PasswordGate>
        <ActionBarProvider>
          <Router>
            <AppContent />
            <Toaster />
          </Router>
        </ActionBarProvider>
      </PasswordGate>
    </ThemeProvider>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = usePageTitle(location.pathname);
  const isMobile = useIsMobile();
  const [sidebarVisible, setSidebarVisible] = React.useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [topRailQuery, setTopRailQuery] = React.useState('');
  const [assistantOpen, setAssistantOpen] = React.useState(false);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatStreamingId, setChatStreamingId] = React.useState<string | null>(null);
  const [chatSkill, setChatSkill] = React.useState<string | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  // Memoized computation for back button visibility
  const shouldShowBackButton = React.useMemo(() => {
    const pathSegments = location.pathname.split('/').filter(segment => segment !== '');
    return pathSegments.length >= 2;
  }, [location.pathname]);

  // Memoized computation for evidence detail page detection
  const isEvidenceDetailPage = React.useMemo(() => {
    const pathSegments = location.pathname.split('/').filter(segment => segment !== '');
    // Evidence detail from cases page: /cases/caseId/evidence/index
    // Evidence detail from evidence page: /evidence/caseId/index
    return (pathSegments.length === 4 && pathSegments[2] === 'evidence') ||
           (pathSegments.length === 3 && pathSegments[0] === 'evidence' && pathSegments[1] !== 'item');
  }, [location.pathname]);

  // Handle sidebar visibility based on route changes
  React.useEffect(() => {
    if (isMobile) {
      // On mobile, hide sidebar by default
      setSidebarVisible(false);
    } else if (isEvidenceDetailPage) {
      // Hide sidebar by default on evidence detail page
      setSidebarVisible(false);
    } else {
      // Show sidebar on all other pages
      setSidebarVisible(true);
    }
  }, [isMobile, isEvidenceDetailPage]);

  const utilitySearchRef = React.useRef<HTMLInputElement>(null);

  // Focus utility bar search on '/' keypress (when not in an input). Disabled on home.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      if (location.pathname === '/home') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      if (utilitySearchRef.current) {
        utilitySearchRef.current.focus();
      } else {
        navigate('/search');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [location.pathname]);

  // Memoized handlers to prevent unnecessary re-renders
  const handleSidebarToggle = React.useCallback(() => {
    setSidebarVisible(prev => !prev);
  }, []);

  const handleSidebarCollapseToggle = React.useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  // Memoized back navigation handler
  const handleBack = React.useCallback(() => {
    const pathSegments = location.pathname.split('/').filter(segment => segment !== '');
    const searchParams = new URLSearchParams(location.search);
    const filtersParam = searchParams.get('filters');
    
    if (pathSegments.length >= 2) {
      // Special handling for evidence detail pages
      if (pathSegments.length === 4 && pathSegments[2] === 'evidence') {
        // /cases/caseId/evidence/index -> /cases/caseId (preserve filters)
        const caseDetailPath = '/' + pathSegments.slice(0, 2).join('/');
        if (filtersParam) {
          navigate(`${caseDetailPath}?filters=${encodeURIComponent(filtersParam)}`);
        } else {
          navigate(caseDetailPath);
        }
      } else if (pathSegments.length === 3 && pathSegments[0] === 'evidence') {
        // /evidence/caseId/index -> /evidence
        navigate('/evidence');
      } else {
        // Navigate to parent route (e.g., /cases/case-id -> /cases)
        const parentPath = '/' + pathSegments.slice(0, -1).join('/');
        navigate(parentPath);
      }
    }
  }, [location.pathname, location.search, navigate]);

  // Memoized navigation handler for mobile sidebar
  const handleMobileNavigation = React.useCallback(() => {
    setSidebarVisible(false);
  }, []);

  const FACIAL_MATCH_WATCHLIST_RE = /facial.?match.*watchlist|watchlist.*facial.?match|enable.*watchlist|watchlist.*permiss/i;

  const makeFacialMatchMock = (): ChatMessage => ({
    id: `asst-${Date.now()}`,
    role: 'assistant',
    text: "Sure. To grant Administrators on Pro accounts the ability to create and edit facial match watchlists, I'll update the role permission configuration. Please review and approve the change below.",
    toolCall: {
      name: 'set_permission',
      label: 'Enable: Create and Edit Facial Match Watchlist',
      description: 'Grants Administrators on Pro accounts the ability to create and edit facial recognition watchlists.',
      input: {
        permission: 'facial_match_watchlist.create_edit',
        role: 'Administrator',
        account_type: 'Pro',
        enabled: 'true',
      },
      status: 'pending',
    } as ToolCall,
  });

  const handleToolCallApprove = React.useCallback((msgId: string) => {
    setChatMessages(prev => prev.map(m =>
      m.id === msgId && m.toolCall
        ? { ...m, toolCall: { ...m.toolCall, status: 'approved' as const } }
        : m
    ));
  }, []);

  const handleToolCallDeny = React.useCallback((msgId: string) => {
    setChatMessages(prev => prev.map(m =>
      m.id === msgId && m.toolCall
        ? { ...m, toolCall: { ...m.toolCall, status: 'denied' as const } }
        : m
    ));
  }, []);

  const handleAssistantSend = React.useCallback(async (text: string) => {
    if (text.startsWith('__system__')) {
      const systemText = text.slice('__system__'.length);
      setChatMessages(prev => [...prev, { id: `sys-${Date.now()}`, role: 'system', text: systemText }]);
      return;
    }

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text };

    if (FACIAL_MATCH_WATCHLIST_RE.test(text)) {
      setChatMessages(prev => [...prev, userMsg, makeFacialMatchMock()]);
      return;
    }

    const assistantId = `asst-${Date.now()}`;
    const history: EngineChatMessage[] = [...chatMessages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.text }));

    setChatMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', text: '', evidenceSnapshot: [] }]);
    setChatStreamingId(assistantId);

    const raw = { current: '' };
    try {
      await chatWithEvidenceStream(text, history, [], (chunk) => {
        raw.current += chunk;
        const { thinking, text: afterThinking } = parseThinkingFromRaw(raw.current);
        const { content: afterDraft, draft } = parseDraft(afterThinking);
        const { text: afterNeedsEvidence } = parseNeedsEvidence(afterDraft);
        const stripped = stripActionTags(afterNeedsEvidence);
        const pendingDraft = afterThinking.includes('<draft_report') && draft === null;
        setChatMessages(prev => prev.map(m => m.id === assistantId ? {
          ...m, thinking, text: stripped, draft: draft ?? m.draft, pendingDraft,
        } : m));
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: msg } : m));
    } finally {
      setChatStreamingId(null);
    }
  }, [chatMessages]);

  return (
    <TooltipProvider>
      <div className="h-screen flex bg-base">
        {/* Import Evidence modal */}
        <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />

        {/* Desktop Sidebar */}
        {!isMobile && sidebarVisible && (
          <ConfigurableSidebar
            navItems={navigationItems}
            headerIcon={headerIcon}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={handleSidebarCollapseToggle}
          />
        )}

        {/* Mobile Sidebar Overlay */}
        {isMobile && sidebarVisible && (
          <>
            <div
              className="fixed inset-0 z-40"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
              onClick={handleSidebarToggle}
            />
            <div className="fixed inset-y-0 left-0 z-50">
              <ConfigurableSidebar
                navItems={navigationItems}
                headerIcon={headerIcon}
                isCollapsed={false}
                onToggleCollapse={handleSidebarCollapseToggle}
                onNavigate={handleMobileNavigation}
              />
            </div>
          </>
        )}
        
        {/* Main content area */}
        <div className="flex-1 h-full flex flex-col" style={{ minWidth: 0 }}>
          {/* Top Rail */}
          {!isMobile && location.pathname !== '/home' && (
            <div
              className="relative shrink-0 flex items-center px-6"
              style={{
                height: 64,
                backgroundColor: 'var(--raised)',
                borderBottom: '1px solid var(--border)',
                zIndex: 300,
              }}
            >
              <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 560 }}>
                <TopRailSearch
                  onOpenSearch={(query, selectedId, output) => { setTopRailQuery(query); navigate('/search', { state: { query, selectedId, output } }); }}
                  searchInputRef={utilitySearchRef}
                  query={topRailQuery}
                  onQueryChange={setTopRailQuery}
                  resultCount={0}
                  onReopenSearch={() => navigate('/search', { state: { query: topRailQuery } })}
                  onClearResults={() => setTopRailQuery('')}
                  onAiMode={() => setAssistantOpen(true)}
                />
              </div>
              <div className="ml-auto">
                <UtilityIcons onOpenAssistant={() => setAssistantOpen(true)} />
              </div>
            </div>
          )}

          {/* Fixed Utility Bar - hidden on home page; on desktop search the
              title moves into the filter chip row, so the bar is hidden there
              (kept on mobile search for the sidebar toggle) */}
          {location.pathname !== '/home' && !(location.pathname === '/search' && !isMobile) && (
          <div className="shrink-0">
            <UtilityBar
              title={pageTitle}
              showBackButton={shouldShowBackButton}
              onBack={handleBack}
              showSidebarToggle={isMobile || isEvidenceDetailPage}
              sidebarVisible={sidebarVisible}
              onSidebarToggle={handleSidebarToggle}
              onOpenSearch={(query, selectedId, output) => { setTopRailQuery(query ?? ''); navigate('/search', { state: { query, selectedId, output } }); }}
              onOpenAssistant={() => setAssistantOpen(true)}
              searchInputRef={utilitySearchRef}
              actions={location.pathname === '/cases' ? (
                <button
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--text-strong)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}
                >
                  <Plus size={14} />
                  Create Case
                </button>
              ) : location.pathname === '/evidence' ? (
                <button
                  onClick={() => setImportOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--text-strong)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Plus size={14} />
                  Add Evidence
                </button>
              ) : undefined}
            />
          </div>
          )}
          
          {/* Scrollable content area */}
          <div className={`flex-1 ${location.pathname === '/search' ? 'overflow-hidden h-full' : 'overflow-y-auto'}`} style={{ minWidth: 0 }}>
            <Routes>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/search" element={<SearchTakeover key={location.key} />} />
              <Route path="/home" element={<HomePage onSearch={(q) => { setTopRailQuery(q); navigate('/search', { state: { query: q } }); }} />} />
              <Route path="/evidence" element={<EvidencePage />} />
              <Route path="/evidence/item/:evidenceId" element={<SearchEvidenceDetailPage />} />
              <Route path="/evidence/:caseId/:evidenceIndex" element={<EvidenceDetailPage />} />
              <Route path="/cases" element={<CasesPage />} />
              <Route path="/cases/:caseId" element={<CaseDetailPage />} />
              <Route path="/cases/:caseId/evidence/:evidenceIndex" element={<EvidenceDetailPage />} />
              <Route path="/search/evidence/:evidenceId" element={<SearchEvidenceDetailPage />} />
              <Route path="/community" element={<CommunityPage />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              {/* Catch-all route for unmatched paths */}
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </div>
        </div>

        {/* Global Assistant Drawer */}
        <ChatDrawer
          open={assistantOpen}
          messages={chatMessages}
          onClose={() => setAssistantOpen(false)}
          onNewChat={() => setChatMessages([])}
          onSend={handleAssistantSend}
          onSelectEvidence={() => {}}
          evidenceOpen={false}
          evidenceCount={0}
          isStreaming={chatStreamingId !== null}
          skill={chatSkill}
          onSkillChange={setChatSkill}
          evidenceItems={[]}
          onOpenDraft={() => {}}
          onToolCallApprove={handleToolCallApprove}
          onToolCallDeny={handleToolCallDeny}
        />
      </div>
    </TooltipProvider>
  );
}

// Memoized component to get the current page title based on route
function usePageTitle(pathname: string): string {
  return React.useMemo(() => {
    if (pathname === '/home') return 'Home';
    if (pathname === '/search') return 'Search Results';
    if (pathname === '/evidence') return 'Evidence';
    if (pathname === '/cases') return 'Cases';
    if (pathname === '/community') return 'Community';
    if (pathname === '/devices') return 'Devices';
    if (pathname === '/analytics') return 'Analytics';
    
    // Handle evidence detail routes from evidence page (e.g., /evidence/25-08-001/0)
    if (pathname.startsWith('/evidence/') && pathname !== '/evidence') {
      const pathSegments = pathname.split('/').filter(segment => segment !== '');
      if (pathSegments.length === 3) {
        const caseId = pathSegments[1];
        const evidenceIndex = parseInt(pathSegments[2]);
        const caseEvidence = getEvidenceByCaseId(caseId);
        const evidence = caseEvidence[evidenceIndex];
        if (evidence) {
          return evidence.title;
        }
        return `Evidence ${evidenceIndex + 1}`;
      }
    }

    // Handle case detail routes (e.g., /cases/25-08-001)
    if (pathname.startsWith('/cases/')) {
      const pathSegments = pathname.split('/').filter(segment => segment !== '');
      const caseId = pathSegments[1];
      
      // Check if this is an evidence detail route (e.g., /cases/25-08-001/evidence/0)
      if (pathSegments.length === 4 && pathSegments[2] === 'evidence') {
        const evidenceIndex = parseInt(pathSegments[3]);
        const caseEvidence = getEvidenceByCaseId(caseId);
        const evidence = caseEvidence[evidenceIndex];
        if (evidence) {
          return evidence.title;
        }
        return `Evidence ${evidenceIndex + 1}`;
      }
      
      return `Case ${caseId}`;
    }
    
    return 'Evidence';
  }, [pathname]);
}
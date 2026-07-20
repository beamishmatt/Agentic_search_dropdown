import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { getCaseById } from '../../data/mockCases';
import { getEvidenceByCaseId } from '../../data/mockEvidence';
import { Evidence } from '../../data/types';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { Play, Pause, Volume2, Maximize, SkipBack, SkipForward, RotateCw, ZoomIn, Settings2, Settings, MoreVertical, Menu, Info, MessageSquare, Map, Users, Bookmark, LayoutPanelLeft, Gauge } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { OverviewPanel } from '../OverviewPanel';
import { SyntheticMap } from '../SyntheticMap';
import { getContextGraph } from '../../storage/config';

type PanelType = 'overview' | 'details' | 'maps' | 'notes' | 'people' | 'markers';

export function EvidenceDetailPage() {
  const { caseId, evidenceIndex } = useParams<{ caseId: string; evidenceIndex: string }>();
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [volume, setVolume] = React.useState(80);
  const [activePanel, setActivePanel] = React.useState<PanelType>('overview');
  const [isPanelCollapsed, setIsPanelCollapsed] = React.useState(true); // Default to collapsed
  
  // Set initial collapsed state based on screen size
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)'); // xl breakpoint
    setIsPanelCollapsed(!mediaQuery.matches); // Collapsed on medium, expanded on xl+
    
    const handleResize = (e: MediaQueryListEvent) => {
      setIsPanelCollapsed(!e.matches);
    };
    
    mediaQuery.addEventListener('change', handleResize);
    return () => mediaQuery.removeEventListener('change', handleResize);
  }, []);
  
  // Find the case by caseId
  const case_ = getCaseById(caseId || '');
  
  // Get evidence associated with this case
  const caseEvidence = getEvidenceByCaseId(caseId || '');
  
  // Get the specific evidence item by index
  const evidenceIndexNum = parseInt(evidenceIndex || '0');
  const evidence: Evidence | undefined = caseEvidence[evidenceIndexNum];

  // If case or evidence is not found, redirect to cases page
  if (!case_ || !evidence || isNaN(evidenceIndexNum) || evidenceIndexNum >= caseEvidence.length) {
    return <Navigate to="/cases" replace />;
  }

  // Parse duration to get total seconds
  const parseDuration = (duration: string): number => {
    if (duration === 'N/A') return 0;
    const parts = duration.split(':').map(p => parseInt(p));
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  const totalSeconds = parseDuration(evidence.duration);

  // Format seconds to HH:MM:SS or MM:SS
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(Number(e.target.value));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  return (
    <div 
      className="h-full overflow-hidden p-3 md:p-6 flex flex-col"
      style={{ backgroundColor: 'var(--sunken)' }}
    >
      <div className="h-full w-full flex gap-6">
        {/* Main Panel - Flexible width */}
        <div 
          className="flex-1 rounded-lg overflow-hidden flex flex-col h-full"
          style={{ 
            backgroundColor: 'var(--raised)'
          }}
        >
          {/* Media Player */}
          <div
            className="flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: 'var(--sunken)', height: '520px' }}
          >
            {evidence.thumbnailUrl ? (
              <ImageWithFallback
                src={evidence.thumbnailUrl}
                alt={evidence.title}
                style={{ height: '520px', width: 'auto', objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <div 
                className="flex items-center justify-center"
                style={{
                  fontSize: 'var(--text-body)',
                  fontWeight: 'var(--font-weight-regular)',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color: 'var(--text-secondary)'
                }}
              >
                No preview available
              </div>
            )}
          </div>

          {/* Media Toolbar */}
          <div 
            className="px-6 py-3"
            style={{ 
              background: 'linear-gradient(to bottom, var(--sunken), var(--overlay))'
            }}
          >
            {/* Controls */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {/* Skip Back Button */}
                <button className="hover:opacity-70 transition-opacity">
                  <SkipBack className="w-4 h-4" fill="currentColor" style={{ color: 'var(--foreground)' }} />
                </button>

                {/* Play/Pause Button */}
                <button
                  onClick={handlePlayPause}
                  className="hover:opacity-70 transition-opacity"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" fill="currentColor" style={{ color: 'var(--foreground)' }} />
                  ) : (
                    <Play className="w-5 h-5" fill="currentColor" style={{ color: 'var(--foreground)' }} />
                  )}
                </button>

                {/* Skip Forward Button */}
                <button className="hover:opacity-70 transition-opacity">
                  <SkipForward className="w-4 h-4" fill="currentColor" style={{ color: 'var(--foreground)' }} />
                </button>

                {/* Time Display */}
                <div 
                  className="ml-2"
                  style={{
                    fontSize: 'var(--text-caption)',
                    fontWeight: 'var(--font-weight-regular)',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    color: 'var(--foreground)'
                  }}
                >
                  {formatTime(currentTime)} / {evidence.duration}
                </div>

                {/* Rotate Button - Grouped with time display */}
                <button className="hidden md:block hover:opacity-70 transition-opacity ml-2">
                  <Gauge className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
                </button>
              </div>

              <div className="flex items-center gap-4">
                {/* Desktop: Show all icons */}
                <button className="hidden md:block hover:opacity-70 transition-opacity">
                  <ZoomIn className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
                </button>

                <button className="hidden md:block hover:opacity-70 transition-opacity">
                  <Settings2 className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
                </button>

                <button className="hidden md:block hover:opacity-70 transition-opacity">
                  <Settings className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
                </button>

                <button className="hidden md:block hover:opacity-70 transition-opacity">
                  <Volume2 className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
                </button>

                {/* Mobile: Overflow menu for all icons except Maximize */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="md:hidden hover:opacity-70 transition-opacity">
                      <MoreVertical className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <RotateCw className="w-4 h-4 mr-2" style={{ color: 'var(--foreground)' }} />
                      Rotate
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <ZoomIn className="w-4 h-4 mr-2" style={{ color: 'var(--foreground)' }} />
                      Zoom
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings2 className="w-4 h-4 mr-2" style={{ color: 'var(--foreground)' }} />
                      Adjustments
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings className="w-4 h-4 mr-2" style={{ color: 'var(--foreground)' }} />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Volume2 className="w-4 h-4 mr-2" style={{ color: 'var(--foreground)' }} />
                      Volume
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Maximize - Always visible */}
                <button className="hover:opacity-70 transition-opacity">
                  <Maximize className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
                </button>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <style>
                {`
                  .timeline-slider::-webkit-slider-thumb {
                    appearance: none;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: var(--fill-special-strong);
                    cursor: pointer;
                  }
                  
                  .timeline-slider::-moz-range-thumb {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: var(--fill-special-strong);
                    border: none;
                    cursor: pointer;
                  }
                `}
              </style>
              <input
                type="range"
                min="0"
                max={totalSeconds}
                value={currentTime}
                onChange={handleTimelineChange}
                className="timeline-slider w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--fill-special-strong) 0%, var(--fill-special-strong) ${(currentTime / totalSeconds) * 100}%, var(--border) ${(currentTime / totalSeconds) * 100}%, var(--border) 100%)`
                }}
              />
            </div>
          </div>
        </div>

        {/* Secondary Panel - Fixed 456px width, hidden on mobile */}
        <div 
          className="hidden md:block rounded-lg overflow-hidden transition-all duration-300"
          style={{ 
            width: isPanelCollapsed ? '64px' : '456px',
            backgroundColor: 'var(--raised)'
          }}
        >
          <div className="h-full flex flex-col">
            {/* Content and Navigation Row */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Side - Header and Content */}
              {!isPanelCollapsed && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Header */}
                  <div 
                    className="px-6 py-3 flex items-center gap-2"
                  >
                    <button
                      onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
                      className="w-8 h-8 flex items-center justify-center rounded hover:opacity-70 transition-opacity flex-shrink-0"
                      style={{
                        color: 'var(--foreground)'
                      }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <h3 style={{
                      fontSize: 'var(--text-body)',
                      fontWeight: 'var(--font-weight-regular)',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      color: 'var(--foreground)'
                    }}>
                      {activePanel === 'overview' && 'Overview'}
                      {activePanel === 'details' && 'Details'}
                      {activePanel === 'maps' && 'Maps'}
                      {activePanel === 'notes' && 'Notes'}
                      {activePanel === 'people' && 'People'}
                      {activePanel === 'markers' && 'Markers & Clips'}
                    </h3>
                  </div>

                  {/* Content Area - Scrollable */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {activePanel === 'overview' && (
                      <OverviewPanel evidence={evidence} />
                    )}

                    {activePanel === 'details' && (
                      <div 
                        style={{
                          fontSize: 'var(--text-body)',
                          fontWeight: 'var(--font-weight-regular)',
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          color: 'var(--muted-foreground)'
                        }}
                      >
                        Detailed evidence information and metadata will be displayed here.
                      </div>
                    )}

                    {activePanel === 'maps' && (() => {
                      const location = getContextGraph().cases[caseId || '']?.location;
                      if (!location) {
                        return (
                          <div
                            style={{
                              fontSize: 'var(--text-body)',
                              fontWeight: 'var(--font-weight-regular)',
                              fontFamily: "'IBM Plex Sans', sans-serif",
                              color: 'var(--muted-foreground)',
                            }}
                          >
                            No location data for this evidence.
                          </div>
                        );
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ height: 320, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <SyntheticMap
                              points={[{ id: evidence.uuid, x: location.x, y: location.y, label: location.label, selected: true }]}
                              district={location.district}
                            />
                          </div>
                          <div style={{ fontSize: 'var(--text-body)', fontFamily: "'IBM Plex Sans', sans-serif", color: 'var(--foreground)' }}>
                            {location.label}
                            {location.district ? <span style={{ color: 'var(--muted-foreground)' }}> · {location.district}</span> : null}
                          </div>
                        </div>
                      );
                    })()}

                    {activePanel === 'notes' && (
                      <div 
                        style={{
                          fontSize: 'var(--text-body)',
                          fontWeight: 'var(--font-weight-regular)',
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          color: 'var(--muted-foreground)'
                        }}
                      >
                        Case notes and annotations will be displayed here.
                      </div>
                    )}

                    {activePanel === 'people' && (
                      <div 
                        style={{
                          fontSize: 'var(--text-body)',
                          fontWeight: 'var(--font-weight-regular)',
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          color: 'var(--muted-foreground)'
                        }}
                      >
                        People associated with this evidence will be displayed here.
                      </div>
                    )}

                    {activePanel === 'markers' && (
                      <div 
                        style={{
                          fontSize: 'var(--text-body)',
                          fontWeight: 'var(--font-weight-regular)',
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          color: 'var(--muted-foreground)'
                        }}
                      >
                        Timeline markers and video clips will be displayed here.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Icon Navigation - Right Side */}
              <div 
                className="w-16 flex flex-col items-center py-4 gap-2"
                style={{ 
                  borderLeft: !isPanelCollapsed ? '1px solid var(--border)' : 'none'
                }}
              >
                {/* Expand button when collapsed - positioned at top */}
                {isPanelCollapsed && (
                  <button
                    onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
                    className="w-10 h-10 flex items-center justify-center rounded hover:opacity-70 transition-opacity mb-2"
                    style={{
                      color: 'var(--foreground)'
                    }}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}

                <button
                  onClick={() => setActivePanel('overview')}
                  title="Overview"
                  className="w-10 h-10 flex items-center justify-center rounded transition-colors"
                  style={{
                    backgroundColor: activePanel === 'overview' ? 'var(--fill-weak)' : 'transparent',
                    border: activePanel === 'overview' ? '1px solid var(--border)' : '1px solid transparent',
                    color: 'var(--foreground)'
                  }}
                  onMouseEnter={(e) => {
                    if (activePanel !== 'overview') {
                      e.currentTarget.style.backgroundColor = 'var(--fill-muted-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activePanel !== 'overview') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <LayoutPanelLeft className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setActivePanel('details')}
                  title="Details"
                  className="w-10 h-10 flex items-center justify-center rounded transition-colors"
                  style={{
                    backgroundColor: activePanel === 'details' ? 'var(--fill-weak)' : 'transparent',
                    border: activePanel === 'details' ? '1px solid var(--border)' : '1px solid transparent',
                    color: 'var(--foreground)'
                  }}
                  onMouseEnter={(e) => {
                    if (activePanel !== 'details') {
                      e.currentTarget.style.backgroundColor = 'var(--fill-muted-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activePanel !== 'details') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Info className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setActivePanel('maps')}
                  title="Maps"
                  className="w-10 h-10 flex items-center justify-center rounded transition-colors"
                  style={{
                    backgroundColor: activePanel === 'maps' ? 'var(--fill-weak)' : 'transparent',
                    border: activePanel === 'maps' ? '1px solid var(--border)' : '1px solid transparent',
                    color: 'var(--foreground)'
                  }}
                  onMouseEnter={(e) => {
                    if (activePanel !== 'maps') {
                      e.currentTarget.style.backgroundColor = 'var(--fill-muted-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activePanel !== 'maps') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Map className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setActivePanel('notes')}
                  title="Notes"
                  className="w-10 h-10 flex items-center justify-center rounded transition-colors"
                  style={{
                    backgroundColor: activePanel === 'notes' ? 'var(--fill-weak)' : 'transparent',
                    border: activePanel === 'notes' ? '1px solid var(--border)' : '1px solid transparent',
                    color: 'var(--foreground)'
                  }}
                  onMouseEnter={(e) => {
                    if (activePanel !== 'notes') {
                      e.currentTarget.style.backgroundColor = 'var(--fill-muted-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activePanel !== 'notes') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <MessageSquare className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setActivePanel('people')}
                  title="People"
                  className="w-10 h-10 flex items-center justify-center rounded transition-colors"
                  style={{
                    backgroundColor: activePanel === 'people' ? 'var(--fill-weak)' : 'transparent',
                    border: activePanel === 'people' ? '1px solid var(--border)' : '1px solid transparent',
                    color: 'var(--foreground)'
                  }}
                  onMouseEnter={(e) => {
                    if (activePanel !== 'people') {
                      e.currentTarget.style.backgroundColor = 'var(--fill-muted-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activePanel !== 'people') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Users className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setActivePanel('markers')}
                  title="Markers & Clips"
                  className="w-10 h-10 flex items-center justify-center rounded transition-colors"
                  style={{
                    backgroundColor: activePanel === 'markers' ? 'var(--fill-weak)' : 'transparent',
                    border: activePanel === 'markers' ? '1px solid var(--border)' : '1px solid transparent',
                    color: 'var(--foreground)'
                  }}
                  onMouseEnter={(e) => {
                    if (activePanel !== 'markers') {
                      e.currentTarget.style.backgroundColor = 'var(--fill-muted-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activePanel !== 'markers') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Bookmark className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
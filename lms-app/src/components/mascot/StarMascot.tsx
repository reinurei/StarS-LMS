import React, { useId, useRef, useState } from 'react';

export type MascotPose = 'idle' | 'wave' | 'cheer' | 'heart';

export interface StarMascotProps {
  /** Character pose matching the Model.jpg turnaround sheet. */
  pose?: MascotPose;
  /** Size in pixels (width & height). */
  size?: number;
  /** Enable interactive mouse-tracking 3D tilt & click cheer reaction. */
  interactive?: boolean;
  /** Optional floating speech bubble text shown on hover/click. */
  message?: string;
  className?: string;
}

/**
 * Interactive 3D-shaded Star Mascot modeled faithfully after Model.jpg:
 * - Rounded golden-yellow 5-point star head & plush body with 3D volumetric shading
 * - Chocolate-brown scarf with cream trim & embossed cream mini-star pin
 * - Glossy expressive eyes with blink animation & coral-pink blush cheeks
 * - CSS 3D perspective cursor tilt, gentle float, and interactive click bounce
 */
export function StarMascot({
  pose = 'wave',
  size = 156,
  interactive = true,
  message,
  className = '',
}: StarMascotProps) {
  const uid = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);

  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [clickedCheer, setClickedCheer] = useState(false);
  const [showBubble, setShowBubble] = useState(false);

  const activePose: MascotPose = clickedCheer ? 'cheer' : pose;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rx: Math.max(-18, Math.min(18, -y * 30)),
      ry: Math.max(-22, Math.min(22, x * 36)),
    });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0 });
    setShowBubble(false);
  };

  const handleClick = () => {
    if (!interactive) return;
    setClickedCheer(true);
    setShowBubble(true);
    window.setTimeout(() => {
      setClickedCheer(false);
    }, 1800);
  };

  const bodyGradId = `starBody-${uid}`;
  const headGradId = `starHead-${uid}`;
  const glossGradId = `starGloss-${uid}`;
  const scarfGradId = `scarfGrad-${uid}`;
  const creamGradId = `creamGrad-${uid}`;
  const cheekGradId = `cheekGrad-${uid}`;
  const heartGradId = `heartGrad-${uid}`;
  const dropShadowId = `softShadow-${uid}`;
  const rimFilterId = `clay3d-${uid}`;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => interactive && setShowBubble(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label="StarS Star Mascot"
      style={{ width: size, height: size, perspective: '700px' }}
      className={[
        'relative inline-flex select-none flex-col items-center justify-center',
        interactive ? 'cursor-pointer focus:outline-none' : '',
        className,
      ].join(' ')}
    >
      {/* Optional Speech Bubble */}
      {message && showBubble && (
        <div className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#1E1B4B] shadow-lg ring-1 ring-[#EDE9FE]">
          {clickedCheer ? 'Yay! Keep learning! ✨' : message}
        </div>
      )}

      {/* 3D Tilting Stage */}
      <div
        className="relative flex h-full w-full items-center justify-center transition-transform duration-150 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${clickedCheer ? 1.07 : 1})`,
        }}
      >
        <div className="animate-mascot-float h-full w-full">
          <svg
            viewBox="0 0 220 245"
            className="h-full w-full overflow-visible drop-shadow-[0_14px_18px_rgba(74,44,29,0.22)]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Volumetric 3D Clay Star Head Gradient (Model.jpg palette) */}
              <radialGradient id={headGradId} cx="38%" cy="28%" r="72%" fx="34%" fy="24%">
                <stop offset="0%" stopColor="#FFE58F" />
                <stop offset="38%" stopColor="#FFCA4B" />
                <stop offset="78%" stopColor="#F5AE35" />
                <stop offset="100%" stopColor="#DC8B1B" />
              </radialGradient>

              {/* Volumetric 3D Body & Limbs Gradient */}
              <radialGradient id={bodyGradId} cx="38%" cy="25%" r="75%">
                <stop offset="0%" stopColor="#FFDF7B" />
                <stop offset="48%" stopColor="#FBC13D" />
                <stop offset="85%" stopColor="#EC9E24" />
                <stop offset="100%" stopColor="#D48216" />
              </radialGradient>

              {/* Top Specular Gloss Highlight */}
              <linearGradient id={glossGradId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>

              {/* 3D Chocolate Scarf Gradient */}
              <linearGradient id={scarfGradId} x1="15%" y1="0%" x2="85%" y2="100%">
                <stop offset="0%" stopColor="#7A4832" />
                <stop offset="45%" stopColor="#5C3422" />
                <stop offset="100%" stopColor="#3B1E12" />
              </linearGradient>

              {/* Cream Scarf Backing Trim */}
              <linearGradient id={creamGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF8EA" />
                <stop offset="100%" stopColor="#E6D5B8" />
              </linearGradient>

              {/* Soft Plush Coral Cheeks */}
              <radialGradient id={cheekGradId} cx="45%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#FFB8A8" />
                <stop offset="75%" stopColor="#FF8E7C" />
                <stop offset="100%" stopColor="#F27262" />
              </radialGradient>

              {/* 3D Heart Gradient */}
              <radialGradient id={heartGradId} cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#FFCAD4" />
                <stop offset="50%" stopColor="#FF7E96" />
                <stop offset="100%" stopColor="#E04F6D" />
              </radialGradient>

              {/* Subtle 3D Soft Shadow Filter */}
              <filter id={dropShadowId} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#4A2C1D" floodOpacity="0.22" />
              </filter>

              {/* Clay Inner Depth Filter */}
              <filter id={rimFilterId} x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#B86B11" floodOpacity="0.3" />
              </filter>
            </defs>

            {/* === TORSO & LEGS (3D Plush Base) === */}
            <g filter={`url(#${rimFilterId})`}>
              {/* Left Leg */}
              <rect
                x="78"
                y="186"
                width="27"
                height="36"
                rx="13.5"
                fill={`url(#${bodyGradId})`}
              />
              {/* Right Leg */}
              <rect
                x="115"
                y="186"
                width="27"
                height="36"
                rx="13.5"
                fill={`url(#${bodyGradId})`}
              />
              {/* Chubby Torso */}
              <rect
                x="74"
                y="142"
                width="72"
                height="64"
                rx="30"
                fill={`url(#${bodyGradId})`}
              />
              {/* Subtle Belly 3D Highlight */}
              <ellipse cx="104" cy="166" rx="18" ry="12" fill="#FFF1B8" opacity="0.32" />
            </g>

            {/* === ARMS (Pose-Dependent) === */}
            {activePose === 'idle' && (
              <g filter={`url(#${rimFilterId})`}>
                <ellipse
                  cx="67"
                  cy="168"
                  rx="13"
                  ry="20"
                  transform="rotate(28 67 168)"
                  fill={`url(#${bodyGradId})`}
                />
                <ellipse
                  cx="153"
                  cy="168"
                  rx="13"
                  ry="20"
                  transform="rotate(-28 153 168)"
                  fill={`url(#${bodyGradId})`}
                />
              </g>
            )}

            {activePose === 'wave' && (
              <g filter={`url(#${rimFilterId})`}>
                {/* Left Arm Resting */}
                <ellipse
                  cx="67"
                  cy="170"
                  rx="13"
                  ry="20"
                  transform="rotate(24 67 170)"
                  fill={`url(#${bodyGradId})`}
                />
                {/* Right Arm Raised & Waving! */}
                <g className="animate-mascot-wave">
                  <ellipse
                    cx="162"
                    cy="148"
                    rx="13"
                    ry="22"
                    transform="rotate(42 162 148)"
                    fill={`url(#${bodyGradId})`}
                  />
                  <ellipse
                    cx="166"
                    cy="140"
                    rx="5"
                    ry="8"
                    transform="rotate(42 166 140)"
                    fill="#FFF4C6"
                    opacity="0.45"
                  />
                </g>
              </g>
            )}

            {activePose === 'cheer' && (
              <g filter={`url(#${rimFilterId})`}>
                {/* Both hands joyfully raised near cheeks */}
                <ellipse
                  cx="74"
                  cy="148"
                  rx="14"
                  ry="18"
                  transform="rotate(-25 74 148)"
                  fill={`url(#${bodyGradId})`}
                />
                <ellipse
                  cx="146"
                  cy="148"
                  rx="14"
                  ry="18"
                  transform="rotate(25 146 148)"
                  fill={`url(#${bodyGradId})`}
                />
              </g>
            )}

            {activePose === 'heart' && (
              <g filter={`url(#${rimFilterId})`}>
                {/* Arms hugging inward */}
                <ellipse
                  cx="82"
                  cy="168"
                  rx="14"
                  ry="18"
                  transform="rotate(-38 82 168)"
                  fill={`url(#${bodyGradId})`}
                />
                <ellipse
                  cx="138"
                  cy="168"
                  rx="14"
                  ry="18"
                  transform="rotate(38 138 168)"
                  fill={`url(#${bodyGradId})`}
                />
              </g>
            )}

            {/* === CHOCOLATE SCARF WITH CREAM TRIM & STAR PIN (Model.jpg) === */}
            <g filter={`url(#${dropShadowId})`}>
              {/* Cream Under-Layer Tail */}
              <path
                d="M106 154 L117 154 L119 196 Q114 201 107 198 Z"
                fill={`url(#${creamGradId})`}
              />
              {/* Main Brown Scarf Hanging Tail */}
              <path
                d="M91 153 L109 153 L108 197 Q99 201 91 196 Z"
                fill={`url(#${scarfGradId})`}
              />
              {/* Neck Wrap */}
              <path
                d="M68 144 Q110 163 152 144 Q157 154 147 161 Q110 175 73 161 Q63 154 68 144 Z"
                fill={`url(#${scarfGradId})`}
              />
              {/* Subtle 3D specular highlight on scarf wrap */}
              <path
                d="M78 148 Q110 160 142 148"
                stroke="#9E654A"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
                opacity="0.45"
              />
              {/* Tiny Cream 5-Point Star Pin on right of scarf */}
              <path
                d="M126 148.5 L127.8 152.2 L131.8 152.7 L128.9 155.4 L129.6 159.4 L126 157.4 L122.4 159.4 L123.1 155.4 L120.2 152.7 L124.2 152.2 Z"
                fill={`url(#${creamGradId})`}
              />
            </g>

            {/* Pink Heart held over chest in 'heart' pose */}
            {activePose === 'heart' && (
              <g filter={`url(#${dropShadowId})`}>
                <path
                  d="M110 189 C110 189 93 177.5 93 167 C93 161.5 97.5 157.5 102.5 157.5 C106 157.5 108.6 159.5 110 162 C111.4 159.5 114 157.5 117.5 157.5 C122.5 157.5 127 161.5 127 167 C127 177.5 110 189 110 189 Z"
                  fill={`url(#${heartGradId})`}
                />
                <ellipse cx="101.5" cy="165" rx="3.2" ry="2" transform="rotate(-28 101.5 165)" fill="#FFFFFF" opacity="0.65" />
              </g>
            )}

            {/* === PLUMP 3D 5-POINT STAR HEAD === */}
            <g filter={`url(#${dropShadowId})`}>
              <path
                d="M110 16
                   C119 16 128 38 135 51
                   C149 54 176 58 182 67
                   C187 75 170 96 161 107
                   C163 121 168 140 158 148
                   C149 155 128 149 110 149
                   C92 149 71 155 62 148
                   C52 140 57 121 59 107
                   C50 96 33 75 38 67
                   C44 58 71 54 85 51
                   C92 38 101 16 110 16 Z"
                fill={`url(#${headGradId})`}
              />

              {/* 3D Specular Crown Gloss */}
              <path
                d="M110 22 C116 22 122 36 127 48 C120 44 100 44 93 48 C98 36 104 22 110 22 Z"
                fill={`url(#${glossGradId})`}
              />
              <ellipse
                cx="64"
                cy="73"
                rx="13"
                ry="6"
                transform="rotate(-18 64 73)"
                fill="#FFF7D6"
                opacity="0.45"
              />
              {/* Bottom warm 3D bounce light edge */}
              <path
                d="M72 144 Q110 150 148 144"
                stroke="#C97710"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.32"
              />
            </g>

            {/* === EXPRESSIVE FACE === */}
            <g>
              {/* Honey-Brown Eyebrows */}
              <path
                d="M76 92 Q83 86 90 90"
                stroke="#C47F17"
                strokeWidth="3.2"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M130 90 Q137 86 144 92"
                stroke="#C47F17"
                strokeWidth="3.2"
                strokeLinecap="round"
                fill="none"
              />

              {/* Eyes */}
              {activePose === 'cheer' ? (
                <g>
                  {/* Happy smiling crescent eyes */}
                  <path
                    d="M75 113 Q85 99 95 113"
                    stroke="#4A2C1D"
                    strokeWidth="4.8"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M125 113 Q135 99 145 113"
                    stroke="#4A2C1D"
                    strokeWidth="4.8"
                    strokeLinecap="round"
                    fill="none"
                  />
                </g>
              ) : (
                <g className="animate-mascot-blink">
                  {/* Left Eye */}
                  <ellipse cx="85" cy="112" rx="11.5" ry="12.5" fill="#FFFFFF" />
                  <ellipse cx="86.5" cy="112" rx="9.5" ry="10.8" fill="#4A2C1D" />
                  <ellipse cx="87" cy="115" rx="6.5" ry="6.2" fill="#6E3F26" opacity="0.65" />
                  <circle cx="82.5" cy="107.5" r="3.4" fill="#FFFFFF" />
                  <circle cx="90.5" cy="116" r="1.5" fill="#FFFFFF" opacity="0.85" />

                  {/* Right Eye */}
                  <ellipse cx="135" cy="112" rx="11.5" ry="12.5" fill="#FFFFFF" />
                  <ellipse cx="133.5" cy="112" rx="9.5" ry="10.8" fill="#4A2C1D" />
                  <ellipse cx="133" cy="115" rx="6.5" ry="6.2" fill="#6E3F26" opacity="0.65" />
                  <circle cx="129.5" cy="107.5" r="3.4" fill="#FFFFFF" />
                  <circle cx="137.5" cy="116" r="1.5" fill="#FFFFFF" opacity="0.85" />
                </g>
              )}

              {/* Coral-Pink Rosy Cheeks */}
              <ellipse cx="70" cy="127" rx="9.5" ry="5.5" fill={`url(#${cheekGradId})`} opacity="0.92" />
              <ellipse cx="150" cy="127" rx="9.5" ry="5.5" fill={`url(#${cheekGradId})`} opacity="0.92" />

              {/* Mouth */}
              {activePose === 'cheer' ? (
                <g>
                  <path
                    d="M100 119 Q110 135 120 119 Q110 121 100 119 Z"
                    fill="#4A2C1D"
                  />
                  <ellipse cx="110" cy="126.5" rx="5.5" ry="3" fill="#FF8E7C" />
                </g>
              ) : (
                <path
                  d="M101 120 Q110 129 119 120"
                  stroke="#4A2C1D"
                  strokeWidth="3.6"
                  strokeLinecap="round"
                  fill="none"
                />
              )}
            </g>

            {/* Cheer Sparkles */}
            {activePose === 'cheer' && (
              <g fill="#FFF5C0" opacity="0.95">
                <path d="M36 42 L39 49 L46 52 L39 55 L36 62 L33 55 L26 52 L33 49 Z" />
                <path d="M184 36 L186.5 41.5 L192 44 L186.5 46.5 L184 52 L181.5 46.5 L176 44 L181.5 41.5 Z" />
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Soft Breathing 3D Ground Shadow */}
      <div
        className="animate-mascot-shadow -mt-2 h-3 rounded-full bg-[#1E1B4B]/25 blur-[4px]"
        style={{ width: Math.round(size * 0.56) }}
      />
    </div>
  );
}

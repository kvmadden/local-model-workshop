import React from 'react';
import { Info } from 'lucide-react';

interface DemoBannerProps {
  appName: string;
  appUrl: string;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ appName, appUrl }) => {
  return (
    <div
      data-testid="demo-preview-banner"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-950/30 border border-amber-800/40 rounded-xl px-4 py-3"
    >
      <div className="flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="text-xs font-semibold text-amber-300">Interactive Demo Preview</span>
          <p className="text-xs text-amber-200 leading-relaxed mt-0.5">
            This playground shows a preview of what this workflow produces. To run it for real on your files, download {appName} below.
          </p>
        </div>
      </div>
      <a
        href={appUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors min-h-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        Get {appName} →
      </a>
    </div>
  );
};

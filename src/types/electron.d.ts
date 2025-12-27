import React from 'react';

declare global {
    namespace JSX {
        interface IntrinsicElements {
            webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
                src?: string;
                style?: React.CSSProperties;
                className?: string;
                allowpopups?: string;
                nodeintegration?: string;
                webpreferences?: string;
            }, HTMLElement>;
        }
    }
}

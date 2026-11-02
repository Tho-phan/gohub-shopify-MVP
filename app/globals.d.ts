declare module "*.css";

import type { DetailedHTMLProps, HTMLAttributes } from "react";

// App Bridge's <s-app-nav> navigation element is not part of @shopify/polaris-types
// (which supplies the s-* Polaris tags), so declare it here to keep JSX typecheck green.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

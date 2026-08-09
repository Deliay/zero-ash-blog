// Site Configuration
// Centralize all settings here, do not hardcode in components.

export const siteConfig = {
  // Site title — displayed in nav, footer, and page titles
  title: 'ZeroAsh的碎碎念',

  // Site description — used in meta tags and hero section
  description: '写点什么好呢',

  // Author name — used in footer and meta author tag
  author: 'ZeroAsh',

  // Site URL — set before deployment (e.g., https://example.com)
  // Used for RSS feed and SEO
  site: 'https://www.fffdan.com',

  // HTML lang attribute — affects SEO and accessibility
  lang: 'en',

  beian: {
    ICP: '黔ICP备2026013851号-1',
  },

  // Navigation links — displayed in capsule nav bar
  nav: [
    { title: '主页', href: '/' },
    { title: '关于我', href: '/about' },
    { title: 'Tags', href: '/tags' },
  ],

  // Social links — leave empty to hide
  social: {
    github: 'https://github.com/deliay',
  },

  // Feature toggles
  features: {
    readingProgress: true,  // Show reading progress bar on post pages
    backToTop: true,        // Show back to top button
    callout: true,          // Show callout components in blog posts
    lightbox: true,         // Enable image lightbox on click
    rss: true,              // Enable RSS feed
    search: true,           // Enable client-side search (Fuse.js)
  },
};

export type SiteConfig = typeof siteConfig;

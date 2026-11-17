window.__ModuleLoader__.load({
  id: 'poster-forge',
  factory(require) {
    // 一眼可见的自检信号：bundle 一旦被加载，窗口标题会带 [PF]
    try { document.title = '[PF] ' + document.title; } catch (e) { }

    const React = require('react');
    const h = React.createElement;
    const ROUTE = '/api/poster-forge/editor';

    // 左侧栏入口图标
    function PanelIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
        h('path', { d: 'M3 9h18' }),
        h('path', { d: 'M7 13h5M7 16.5h8' }),
        h('circle', { cx: 17, cy: 14.5, r: 2.2 })
      );
    }

    // 主区：同源路由塞进 iframe
    function Workbench() {
      return h('iframe', {
        src: ROUTE,
        title: 'PosterForge 海报工作台',
        style: { width: '100%', height: '100%', border: '0', display: 'block', background: '#f4f9ff' },
      });
    }

    // 输入框下方的小胶囊按钮（文档里验证过的槽位，最稳）
    function DockChip() {
      return h('button', {
        type: 'button',
        title: '打开 PosterForge 海报工作台',
        onClick: () => window.open(ROUTE, '_blank', 'noopener'),
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 28, padding: '0 10px', margin: '2px 6px 2px 0',
          borderRadius: 999, cursor: 'pointer',
          border: '1px solid var(--dsw-alias-border, #cfd8e6)',
          background: 'var(--dsw-alias-surface, #fff)',
          color: 'var(--dsw-alias-text, #1b2a3d)',
          fontSize: 12, lineHeight: 1,
        },
      },
        h('span', { style: { fontSize: 13 } }, '▤'),
        h('span', null, '海报工作台')
      );
    }

    function safe(ctx, label, fn) {
      try { fn(); } catch (e) {
        // 出错也让其它槽位继续注册，并在控制台留下可检索的标记
        console.error('[poster-forge] slot ' + label + ' failed:', e);
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        safe(ctx, 'composer.dock', () => {
          ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
            name: 'conversation.composer.dock', id: 'poster-forge-dock', order: 6,
          }, DockChip));
        });
        safe(ctx, 'sidebar.panellist', () => {
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist', id: 'poster-forge', order: 24, label: '海报工作台',
          }, PanelIcon));
        });
        safe(ctx, 'main', () => {
          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main', key: 'poster-forge',
          }, Workbench));
        });
        console.info('[poster-forge] client ready');
      },
    };
  },
});

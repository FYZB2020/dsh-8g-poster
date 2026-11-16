window.__ModuleLoader__.load({
  id: 'poster-forge',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // 左侧栏的入口图标（20×20 线稿，跟随主题色）
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

    // 主区：把宿主同源路由塞进 iframe
    function Workbench() {
      return h('iframe', {
        src: '/api/poster-forge/editor',
        title: 'PosterForge 海报工作台',
        style: {
          width: '100%',
          height: '100%',
          border: '0',
          display: 'block',
          background: '#f4f9ff',
        },
      });
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'poster-forge',
          order: 24,
          label: '海报工作台',
        }, PanelIcon));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'poster-forge',
        }, Workbench));
      },
    };
  },
});

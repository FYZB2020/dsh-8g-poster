window.__ModuleLoader__.load({
  id: 'poster-forge',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // 一句话提示词：点按钮复制，粘进对话框即可开工。
    // 注意：这里不能出现任何用户专属路径/项目名，发布版要通用。
    const PROMPT = [
      '用 PosterForge 做海报，按这个流程走：',
      '1) 先调 poster_guide，再调 poster_workspace 确认作品文件夹（没设定就问我路径，别自己挑地方）；',
      '2) 问我走哪条路线：flux 出背景+工作台改字，还是 moss 一次成型（不能改图里的字）；',
      '3) 出 3 版，其中一版是放飞自我的艺术版，并标明哪版是艺术版；',
      '4) 排版顺序：先文字（标题/副标/数据/入口），再放元素（logo、吉祥物先抠图再无损贴入，别让模型画），有二维码才贴真码、没有就跳过；然后 poster_check 查遮挡与出血；',
      '5) 让我选一版，选完必须问我要不要进工作台微调；',
      '6) 有码就在交付前 poster_qr verify 逐张扫通（≥0.115×画布短边；没码跳过），导出 PNG 2048/4096/PDF。',
      '硬规矩：不许让模型画 logo 和二维码；配色从素材里读，不许默认暗色+金；合规/资质表述要写清适用边界。',
    ].join('\n');

    const chipStyle = {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      height: 28, padding: '0 10px', margin: '2px 6px 2px 0',
      borderRadius: 999, cursor: 'pointer',
      border: '1px solid var(--dsw-alias-border, #cfd8e6)',
      background: 'var(--dsw-alias-surface, #fff)',
      color: 'var(--dsw-alias-text, #1b2a3d)',
      fontSize: 12, lineHeight: 1, whiteSpace: 'nowrap',
    };

    // 复制兜底：老浏览器 / 权限被拒时用 textarea + execCommand
    function copyText(text, done, fail) {
      const fallback = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-9999px;top:0';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          ok ? done() : fail();
        } catch (e) { fail(); }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else fallback();
    }

    function PromptChip() {
      const [label, setLabel] = React.useState('海报提示词');

      const onClick = () => {
        copyText(PROMPT, () => {
          setLabel('已复制，粘进输入框');
          setTimeout(() => setLabel('海报提示词'), 2600);
        }, () => {
          setLabel('复制失败，请手动');
          setTimeout(() => setLabel('海报提示词'), 2600);
        });
      };

      return h('button', {
        type: 'button',
        title: '复制「海报流程」提示词到剪贴板，粘到对话框就能开工',
        onClick,
        style: chipStyle,
      },
        h('span', { style: { fontSize: 13 } }, '▤'),
        h('span', null, label)
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        try {
          ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
            name: 'conversation.composer.dock', id: 'poster-forge-prompt', order: 6,
          }, PromptChip));
          console.info('[poster-forge] prompt chip ready');
        } catch (e) {
          console.error('[poster-forge] composer.dock failed:', e);
        }
      },
    };
  },
});

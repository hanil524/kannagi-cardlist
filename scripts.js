// html2canvasライブラリを動的に読み込む
function loadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) {
      resolve(window.html2canvas);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
    script.onload = () => resolve(window.html2canvas);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// デッキ画像の保存機能
async function captureDeck() {
  // 保存中メッセージを表示（最初に表示）
  const messageDiv = document.createElement('div');
  messageDiv.className = 'saving-message';
  messageDiv.textContent = '画像を作成中...';
  document.body.appendChild(messageDiv);

  // 確実にメッセージが表示されるよう少し待機
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // html2canvasの読み込み
    const html2canvas = await loadHtml2Canvas();

    // デッキ表示エリアの取得
    const deckDisplay = document.getElementById('deck-display');
    const modalContent = document.querySelector('.deck-modal-content');

    // キャプチャ用のクラスを追加
    deckDisplay.classList.add('capturing');
    modalContent.classList.add('capturing-deck');

    // 現在のデッキ名を取得
    const currentDeckId = deckManager.currentDeckId;
    const deckButton = document.querySelector(`.deck-select-button[data-deck-id="${currentDeckId}"]`);
    const deckName = deckButton ? deckButton.textContent : `デッキ${currentDeckId}`;

    // html2canvasでキャプチャ
    const canvas = await html2canvas(deckDisplay, {
      backgroundColor: '#2a2a2a',
      scale: 3,
      logging: false,
      allowTaint: true,
      useCORS: true,
      imageTimeout: 1000, // 画像読み込みタイムアウトを1秒に設定
      removeContainer: true
    });

    // キャプチャ用クラスを削除
    deckDisplay.classList.remove('capturing');
    modalContent.classList.remove('capturing-deck');

    // より確実なモバイル判定
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;

    if (isMobile) {
      try {
        // DataURLを生成（エラーハンドリング付き）
        const dataUrl = await new Promise((resolve, reject) => {
          try {
            const url = canvas.toDataURL('image/png');
            resolve(url);
          } catch (e) {
            reject(e);
          }
        });

        // モーダルを生成
        const imageModal = document.createElement('div');
        imageModal.className = 'deck-image-modal';

        // モーダルのHTML生成部分
        imageModal.innerHTML = `
<div class="deck-image-container">
  <a href="${dataUrl}" download="${deckName}.png">
    <img src="${dataUrl}" alt="${deckName}">
  </a>
  <p class="save-instruction">画像リンクをタップ、または長押し保存してください</p>
  <button class="modal-close-button">戻る</button>
</div>
`;

        // イベントリスナーを追加
        const closeButton = imageModal.querySelector('.modal-close-button');
        if (closeButton) {
          closeButton.addEventListener('click', () => {
            imageModal.remove();
            document.body.classList.remove('modal-open');
          });
        }

        imageModal.addEventListener('click', (e) => {
          if (e.target === imageModal) {
            imageModal.remove();
            document.body.classList.remove('modal-open');
          }
        });

        // DOMに追加
        document.body.appendChild(imageModal);

        // 少し遅延してからフェードイン（Safari対策）
        setTimeout(() => {
          imageModal.classList.add('active');
        }, 50);
      } catch (error) {
        console.error('モーダル表示エラー:', error);
        alert('画像の表示に失敗しました。');
      }
    } else {
      // PCの場合は通常のダウンロード
      const link = document.createElement('a');
      link.download = `${deckName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  } catch (error) {
    console.error('デッキの画像生成に失敗しました:', error);
    alert('デッキの画像生成に失敗しました。');
  } finally {
    // 保存中メッセージを削除
    const messageDiv = document.querySelector('.saving-message');
    if (messageDiv) {
      messageDiv.remove();
    }
  }
}

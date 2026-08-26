// Initialize Lucide icons
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initializeCoreApp();
  initializeComponentInteractions();
  populateCodeViewers();
  initializeScrollSpy();
});

/* ==========================================================================
   CORE APP FUNCTIONALITY
   ========================================================================== */
function initializeCoreApp() {
  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle-btn');
  themeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    const icon = themeToggle.querySelector('i');
    
    // Switch Lucide Icon
    if (isLight) {
      themeToggle.innerHTML = '<i data-lucide="moon"></i>';
      themeToggle.title = '다크 테마로 변경';
    } else {
      themeToggle.innerHTML = '<i data-lucide="sun"></i>';
      themeToggle.title = '라이트 테마로 변경';
    }
    lucide.createIcons();
  });

  // Search Filter
  const searchInput = document.getElementById('search-input');
  const cards = document.querySelectorAll('.component-card');
  const sidebarItems = document.querySelectorAll('.term-item');
  const categoryGroups = document.querySelectorAll('.category-group');

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();

    // Show/Hide Cards
    cards.forEach(card => {
      const title = card.querySelector('.term-title').textContent.toLowerCase();
      const desc = card.querySelector('.term-desc').textContent.toLowerCase();
      const korean = card.querySelector('.term-korean').textContent.toLowerCase();
      const matches = title.includes(val) || desc.includes(val) || korean.includes(val);
      
      card.style.display = matches ? 'block' : 'none';
    });

    // Show/Hide Sidebar Items
    sidebarItems.forEach(item => {
      const termName = item.querySelector('a').textContent.toLowerCase();
      const termId = item.getAttribute('data-term');
      const card = document.getElementById(`term-${termId}`);
      const matches = card && card.style.display !== 'none';
      
      item.style.display = matches ? 'block' : 'none';
    });

    // Hide Category Headers if empty
    categoryGroups.forEach(group => {
      const visibleItems = group.querySelectorAll('.term-item[style*="display: block"], .term-item:not([style*="display"])');
      group.style.display = visibleItems.length > 0 ? 'block' : 'none';
    });
  });

  // Navigation Smooth Scroll & Highlight Glow
  sidebarItems.forEach(item => {
    item.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = e.currentTarget.getAttribute('href');
      const targetCard = document.querySelector(targetId);
      
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Remove current highlights
        document.querySelectorAll('.component-card.highlight').forEach(c => {
          c.classList.remove('highlight');
        });
        
        // Add new highlight glow
        targetCard.classList.add('highlight');
        
        // Set active state in sidebar
        sidebarItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      }
    });
  });

  // Code Accordion Toggling
  const codeToggleBtns = document.querySelectorAll('.code-toggle-btn');
  codeToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const wrapper = btn.nextElementSibling;
      const icon = btn.querySelector('i');
      const isExpanded = wrapper.classList.toggle('expanded');
      
      btn.classList.toggle('active', isExpanded);
      if (isExpanded) {
        icon.setAttribute('data-lucide', 'chevron-down');
      } else {
        icon.setAttribute('data-lucide', 'chevron-right');
      }
      lucide.createIcons();
    });
  });

  // Code Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewer = btn.closest('.code-viewer-wrapper');
      const tabName = btn.getAttribute('data-tab');
      
      // Toggle Active Tab Header
      viewer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Toggle Active Tab Panel
      viewer.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
      viewer.querySelector(`.${tabName}-content`).classList.add('active');
    });
  });
}

/* ==========================================================================
   SCROLL SPY FOR SIDEBAR SYNCING
   ========================================================================== */
function initializeScrollSpy() {
  const contentArea = document.getElementById('scroll-container');
  const cards = document.querySelectorAll('.component-card');
  const sidebarItems = document.querySelectorAll('.term-item');
  
  contentArea.addEventListener('scroll', () => {
    let currentActiveId = '';
    const scrollPos = contentArea.scrollTop + 140; // offset adjustment
    
    cards.forEach(card => {
      if (card.style.display !== 'none' && scrollPos >= card.offsetTop) {
        currentActiveId = card.id;
      }
    });
    
    if (currentActiveId) {
      sidebarItems.forEach(item => {
        const itemTerm = item.getAttribute('data-term');
        if (currentActiveId === `term-${itemTerm}`) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }
  });
}

/* ==========================================================================
   INTERACTIVE COMPONENT DEMOS
   ========================================================================== */
function initializeComponentInteractions() {
  // --- 02. INPUT ---
  const demoInput = document.getElementById('demo-input-text');
  const demoFormGroup = document.getElementById('demo-form-group');
  const demoHelper = document.getElementById('demo-input-helper');
  
  demoInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val === '') {
      demoFormGroup.classList.remove('has-error');
      demoHelper.style.display = 'block';
    } else if (val.length < 4 || val.length > 12 || !/^[a-z0-9]+$/.test(val)) {
      demoFormGroup.classList.add('has-error');
      demoHelper.style.display = 'none';
    } else {
      demoFormGroup.classList.remove('has-error');
      demoHelper.style.display = 'block';
    }
  });

  // --- 05. DROPDOWN ---
  const dropdownToggleBtn = document.getElementById('dropdown-toggle-btn');
  const dropdownWrapper = document.getElementById('dropdown-example');
  
  dropdownToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownWrapper.classList.toggle('active');
  });

  // Close dropdown on click outside
  window.addEventListener('click', () => {
    dropdownWrapper.classList.remove('active');
  });

  // --- 06. SELECT BOX (CUSTOM) ---
  const customSelect = document.getElementById('custom-select-demo');
  if (customSelect) {
    const trigger = customSelect.querySelector('.select-trigger');
    const optionsContainer = customSelect.querySelector('.select-options-container');
    const valueDisplay = customSelect.querySelector('.select-value');
    const options = customSelect.querySelectorAll('.select-option');
    const hiddenInput = document.getElementById('select-hidden-value');
    
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = customSelect.classList.toggle('active');
      trigger.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    });
    
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.getAttribute('data-value');
        const text = option.querySelector('span').textContent;
        
        // Update selected class
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        // Update display text and input value
        valueDisplay.textContent = text;
        hiddenInput.value = value;
        
        // Close select box
        customSelect.classList.remove('active');
        trigger.setAttribute('aria-expanded', 'false');
        
        // Option select toast alert for demonstration
        showToast('선택 변경', `모델이 '${text}'(으)로 선택되었습니다.`, 'info');
      });
    });
    
    // Close on clicking outside
    window.addEventListener('click', (e) => {
      if (!customSelect.contains(e.target)) {
        customSelect.classList.remove('active');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // --- 07. MODAL ---
  const modalTrigger = document.getElementById('modal-trigger-btn');
  const modalContainer = document.getElementById('modal-container-element');
  const modalCloseIcon = document.getElementById('modal-close-icon-btn');
  const modalCancel = document.getElementById('modal-cancel-element-btn');
  const modalConfirm = document.getElementById('modal-confirm-element-btn');
  
  const showModal = () => modalContainer.classList.add('active');
  const hideModal = () => modalContainer.classList.remove('active');
  
  modalTrigger.addEventListener('click', showModal);
  modalCloseIcon.addEventListener('click', hideModal);
  modalCancel.addEventListener('click', hideModal);
  modalConfirm.addEventListener('click', () => {
    showToast('Success', '성공적으로 저장되었습니다.', 'success');
    hideModal();
  });
  modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) hideModal();
  });

  // --- 08. DIALOG ---
  const dialogTrigger = document.getElementById('dialog-trigger-btn');
  const dialogContainer = document.getElementById('dialog-container-element');
  const dialogCancel = document.getElementById('dialog-cancel-element-btn');
  const dialogConfirm = document.getElementById('dialog-confirm-element-btn');
  
  const showDialog = () => dialogContainer.classList.add('active');
  const hideDialog = () => dialogContainer.classList.remove('active');
  
  dialogTrigger.addEventListener('click', showDialog);
  dialogCancel.addEventListener('click', hideDialog);
  dialogConfirm.addEventListener('click', () => {
    showToast('Danger', '서버 인스턴스를 정상적으로 삭제했습니다.', 'danger');
    hideDialog();
  });
  dialogContainer.addEventListener('click', (e) => {
    if (e.target === dialogContainer) hideDialog();
  });

  // --- 09. TOAST ---
  const toastSuccessBtn = document.getElementById('toast-trigger-success');
  const toastInfoBtn = document.getElementById('toast-trigger-info');
  const toastErrorBtn = document.getElementById('toast-trigger-error');
  
  toastSuccessBtn.addEventListener('click', () => showToast('성공', '사용자 등록을 완료했습니다.', 'success'));
  toastInfoBtn.addEventListener('click', () => showToast('안내', '새로운 대시보드 알림이 있습니다.', 'info'));
  toastErrorBtn.addEventListener('click', () => showToast('실패', '서버 연결에 실패했습니다.', 'danger'));

  // --- 11. POPOVER ---
  const popoverToggle = document.getElementById('popover-toggle-btn');
  const popoverWrapper = document.getElementById('popover-example-wrapper');
  
  popoverToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    popoverWrapper.classList.toggle('active');
  });
  
  window.addEventListener('click', (e) => {
    if (!popoverWrapper.contains(e.target)) {
      popoverWrapper.classList.remove('active');
    }
  });

  // --- 14. DATA GRID ---
  const gridData = [
    { name: '김민수', role: 'Admin', status: 'Active' },
    { name: '이지은', role: 'Member', status: 'Active' },
    { name: '박준서', role: 'Member', status: 'Suspended' },
    { name: '최재현', role: 'Member', status: 'Active' },
    { name: '홍길동', role: 'Admin', status: 'Suspended' }
  ];
  
  const gridSearch = document.getElementById('grid-search-input');
  const gridStatusFilter = document.getElementById('grid-status-filter');
  const gridBody = document.getElementById('grid-data-body');
  const sortHeader = document.getElementById('sort-name-header');
  const sortIcon = document.getElementById('sort-name-icon');
  
  let sortDirection = 1; // 1: Asc, -1: Desc
  
  function renderGrid() {
    const q = gridSearch.value.toLowerCase().trim();
    const status = gridStatusFilter.value;
    
    // Filter
    let filtered = gridData.filter(item => {
      const matchQuery = item.name.toLowerCase().includes(q) || item.role.toLowerCase().includes(q);
      const matchStatus = status === 'ALL' || item.status === status;
      return matchQuery && matchStatus;
    });
    
    // Render
    gridBody.innerHTML = '';
    filtered.forEach(row => {
      const tr = document.createElement('tr');
      const badgeClass = row.status === 'Active' ? 'tag-emerald' : 'tag-rose';
      
      tr.innerHTML = `
        <td>${row.name}</td>
        <td>${row.role}</td>
        <td><span class="tag-demo ${badgeClass}">${row.status}</span></td>
      `;
      gridBody.appendChild(tr);
    });
  }
  
  // Sort Function
  sortHeader.addEventListener('click', () => {
    sortDirection *= -1;
    gridData.sort((a, b) => a.name.localeCompare(b.name) * sortDirection);
    sortIcon.textContent = sortDirection === 1 ? '▲' : '▼';
    renderGrid();
  });
  
  gridSearch.addEventListener('input', renderGrid);
  gridStatusFilter.addEventListener('change', renderGrid);
  renderGrid(); // Initial trigger

  // --- 15. PAGINATION ---
  const pageButtons = document.querySelectorAll('#pagination-control-box .page-btn[data-target-page]');
  const pagePrev = document.getElementById('pag-btn-prev');
  const pageNext = document.getElementById('pag-btn-next');
  const pagStatus = document.getElementById('paginator-status-label');
  let currentPage = 2;
  const maxPages = 5;
  
  function updatePaginationUI() {
    pageButtons.forEach(btn => {
      const p = parseInt(btn.getAttribute('data-target-page'));
      btn.classList.toggle('active', p === currentPage);
    });
    pagePrev.disabled = currentPage === 1;
    pageNext.disabled = currentPage === maxPages;
    pagStatus.textContent = `현재 ${currentPage} / ${maxPages} 페이지`;
  }
  
  pageButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.getAttribute('data-target-page'));
      updatePaginationUI();
    });
  });
  
  pagePrev.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      updatePaginationUI();
    }
  });
  
  pageNext.addEventListener('click', () => {
    if (currentPage < maxPages) {
      currentPage++;
      updatePaginationUI();
    }
  });

  // --- 16. TAB ---
  const tabHeaderBtns = document.querySelectorAll('#tab-demo-group .tab-header-btn');
  const tabPanes = document.querySelectorAll('#tab-demo-group .tab-pane-demo');
  
  tabHeaderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab-panel');
      
      tabHeaderBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      tabPanes.forEach(p => {
        p.classList.toggle('active', p.id === targetId);
      });
    });
  });

  // --- 17. ACCORDION ---
  const accordionTriggers = document.querySelectorAll('#faq-accordion .accordion-trigger');
  
  accordionTriggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.parentElement;
      const panel = trigger.nextElementSibling;
      const isActive = item.classList.toggle('active');
      
      if (isActive) {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      } else {
        panel.style.maxHeight = '0px';
      }
    });
  });

  // --- 18. SIDEBAR COLLAPSE ---
  const sidebarToggle = document.getElementById('demo-sidebar-toggle-action');
  const miniSidebar = document.getElementById('demo-nav-sidebar');
  
  sidebarToggle.addEventListener('click', () => {
    miniSidebar.classList.toggle('collapsed');
  });

  // --- 24. CHIP REMOVE & ADD ---
  const chipContainer = document.getElementById('chip-demo-group-container');
  const addChipBtn = document.getElementById('chip-add-action-btn');
  
  chipContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('chip-remove-trigger')) {
      const chip = e.target.closest('.chip-demo');
      chip.remove();
    }
  });
  
  addChipBtn.addEventListener('click', () => {
    const keywords = ['기획', '마케팅', 'HR', '운영', 'QA'];
    const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
    
    // Create new chip element
    const chip = document.createElement('div');
    chip.className = 'chip-demo';
    chip.innerHTML = `<span>${randomKeyword}</span><i data-lucide="x" class="chip-remove-trigger"></i>`;
    
    chipContainer.insertBefore(chip, addChipBtn);
    lucide.createIcons();
  });

  // --- 26. SLIDER ---
  const sliderBar = document.getElementById('demo-slider-bar');
  const sliderVal = document.getElementById('slider-val-preview');
  
  sliderBar.addEventListener('input', (e) => {
    sliderVal.textContent = e.target.value;
  });

  // --- 27. PROGRESS BAR ---
  const progressSimulate = document.getElementById('progressbar-simulate-btn');
  const progressFill = document.getElementById('progressbar-fill-indicator');
  const progressLabel = document.getElementById('progressbar-percentage-label');
  let uploadTimer = null;
  
  progressSimulate.addEventListener('click', () => {
    if (uploadTimer) clearInterval(uploadTimer);
    
    progressSimulate.disabled = true;
    let percent = 0;
    progressFill.style.width = '0%';
    progressLabel.textContent = '0%';
    
    uploadTimer = setInterval(() => {
      percent += Math.floor(Math.random() * 8) + 4;
      if (percent >= 100) {
        percent = 100;
        clearInterval(uploadTimer);
        progressSimulate.disabled = false;
        showToast('Success', '파일 다운로드가 성공적으로 완료되었습니다.', 'success');
      }
      progressFill.style.width = percent + '%';
      progressLabel.textContent = percent + '%';
    }, 150);
  });

  // --- 28. SKELETON LOADER ---
  const skeletonToggle = document.getElementById('skeleton-toggle-btn');
  const realCard = document.getElementById('skeleton-real-card-element');
  const loaderCard = document.getElementById('skeleton-placeholder-element');
  
  skeletonToggle.addEventListener('click', () => {
    const isLoading = realCard.style.display === 'none';
    if (isLoading) {
      loaderCard.style.display = 'none';
      realCard.style.display = 'block';
    } else {
      realCard.style.display = 'none';
      loaderCard.style.display = 'block';
    }
  });

  // --- 30. FILE UPLOAD ---
  const dropzone = document.getElementById('dropzone-area-box');
  const fileInput = document.getElementById('dropzone-native-input');
  const fileList = document.getElementById('uploaded-files-display-list');
  
  dropzone.addEventListener('click', () => fileInput.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
  
  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
  });
  
  function handleFiles(files) {
    Array.from(files).forEach(file => {
      const sizeKB = (file.size / 1024).toFixed(1);
      const fileItem = document.createElement('div');
      fileItem.className = 'uploaded-file-item';
      fileItem.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; overflow:hidden;">
          <i data-lucide="file" style="width:1rem; height:1rem; flex-shrink:0;"></i>
          <span style="text-overflow:ellipsis; white-space:nowrap; overflow:hidden;">${file.name} (${sizeKB} KB)</span>
        </div>
        <i data-lucide="trash-2" style="width:1rem; height:1rem; cursor:pointer; color:var(--text-muted);" class="file-remove-trigger"></i>
      `;
      fileList.appendChild(fileItem);
      
      fileItem.querySelector('.file-remove-trigger').addEventListener('click', () => {
        fileItem.remove();
      });
      lucide.createIcons();
    });
  }
}

/* ==========================================================================
   GLOBAL TOAST GENERATOR
   ========================================================================== */
function showToast(title, message, type = 'info') {
  const container = document.getElementById('global-toast-container');
  const toast = document.createElement('div');
  toast.className = `toast-demo toast-${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'danger') iconName = 'alert-octagon';
  
  toast.innerHTML = `
    <span class="toast-icon"><i data-lucide="${iconName}"></i></span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close"><i data-lucide="x" style="width:0.875rem; height:0.875rem;"></i></button>
    <div class="toast-progress"></div>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  // Fade in trigger
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Progress Bar timer anim
  const progress = toast.querySelector('.toast-progress');
  let width = 100;
  const interval = 30; // ms
  const totalDuration = 3000; // 3 seconds
  const step = (interval / totalDuration) * 100;
  
  const timer = setInterval(() => {
    width -= step;
    if (width <= 0) {
      clearInterval(timer);
      dismissToast(toast);
    } else {
      progress.style.width = width + '%';
    }
  }, interval);
  
  // Close button trigger
  toast.querySelector('.toast-close').addEventListener('click', () => {
    clearInterval(timer);
    dismissToast(toast);
  });
}

function dismissToast(toast) {
  toast.classList.remove('show');
  setTimeout(() => toast.remove(), 400); // Wait for transition
}

/* ==========================================================================
   BEAUTIFY HTML & LOAD STATIC CODE SNIPPETS
   ========================================================================== */
function populateCodeViewers() {
  const cards = document.querySelectorAll('.component-card');
  
  cards.forEach(card => {
    const termId = card.getAttribute('id').replace('term-', '');
    const demoBox = card.querySelector('.demo-box');
    const htmlSnippet = getBeautifiedHTML(demoBox.innerHTML);
    
    // Inject HTML Code
    card.querySelector('.html-content pre code').innerHTML = htmlSnippet;
    
    // Inject CSS & JS codes based on static mappings
    const cssContent = CSS_TEMPLATES[termId] || `/* 이 컴포넌트는 기본 테마 변수 및 글로벌 클래스를 따릅니다. */`;
    const jsContent = JS_TEMPLATES[termId] || `// 이 컴포넌트는 부가적인 자바스크립트 핸들러가 요구되지 않습니다.`;
    
    card.querySelector('.css-content pre code').textContent = cssContent.trim();
    card.querySelector('.js-content pre code').textContent = jsContent.trim();
  });
}

function getBeautifiedHTML(htmlString) {
  // Simple beauty: remove leading blank spaces, clean up indentations
  const lines = htmlString.split('\n');
  let minIndent = Infinity;
  const filteredLines = lines.filter(line => line.trim() !== '');
  
  filteredLines.forEach(line => {
    const match = line.match(/^(\s*)/);
    if (match) {
      const indent = match[1].length;
      if (indent < minIndent) minIndent = indent;
    }
  });

  const cleanedLines = filteredLines.map(line => {
    return line.substring(minIndent);
  });
  
  return cleanedLines.join('\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ==========================================================================
   CODE SOURCE TEMPLATES DICTIONARY
   ========================================================================== */
const CSS_TEMPLATES = {
  button: `
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.btn-primary { background-color: var(--primary); color: white; }
.btn-primary:hover { background-color: var(--primary-hover); }
.btn-secondary { background-color: var(--bg-tertiary); color: var(--text-primary); border-color: var(--border-color); }
.btn-outline { background-color: transparent; color: var(--primary); border-color: var(--primary); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
  `,
  input: `
.form-group { display: flex; flex-direction: column; gap: 0.375rem; width: 100%; }
.form-label { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }
.input-wrapper { position: relative; display: flex; align-items: center; }
.input-field {
  width: 100%; padding: 0.625rem 1rem;
  background-color: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); color: var(--text-primary); outline: none;
}
.input-field:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
.form-error { font-size: 0.75rem; color: var(--danger); display: none; }
.form-group.has-error .input-field { border-color: var(--danger); }
.form-group.has-error .form-error { display: block; }
  `,
  checkbox: `
.checkbox-label { display: flex; align-items: center; gap: 0.625rem; cursor: pointer; }
.checkbox-input { position: absolute; opacity: 0; cursor: pointer; }
.checkbox-custom {
  width: 1.125rem; height: 1.125rem; background-color: var(--bg-secondary);
  border: 1.5px solid var(--border-color); border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
}
.checkbox-input:checked ~ .checkbox-custom { background-color: var(--primary); border-color: var(--primary); }
.checkbox-custom::after {
  content: ""; display: none; width: 0.25rem; height: 0.5rem;
  border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg);
}
.checkbox-input:checked ~ .checkbox-custom::after { display: block; }
  `,
  radio: `
.radio-label { display: flex; align-items: center; gap: 0.625rem; cursor: pointer; }
.radio-input { position: absolute; opacity: 0; cursor: pointer; }
.radio-custom {
  width: 1.125rem; height: 1.125rem; background-color: var(--bg-secondary);
  border: 1.5px solid var(--border-color); border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
}
.radio-input:checked ~ .radio-custom { border-color: var(--primary); }
.radio-custom::after {
  content: ""; display: none; width: 0.5rem; height: 0.5rem;
  border-radius: var(--radius-full); background-color: var(--primary);
}
.radio-input:checked ~ .radio-custom::after { display: block; }
  `,
  dropdown: `
.dropdown-wrapper { position: relative; display: inline-block; }
.dropdown-menu {
  position: absolute; top: calc(100% + 0.5rem); left: 0; min-width: 200px;
  background-color: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); box-shadow: var(--modal-shadow);
  padding: 0.375rem; opacity: 0; transform: translateY(-8px) scale(0.95);
  visibility: hidden; transition: all var(--transition-normal); z-index: 10;
}
.dropdown-wrapper.active .dropdown-menu { opacity: 1; transform: translateY(0) scale(1); visibility: visible; }
.dropdown-item {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem;
  font-size: 0.875rem; color: var(--text-secondary); border-radius: var(--radius-sm); cursor: pointer;
}
.dropdown-item:hover { background-color: var(--bg-tertiary); color: var(--text-primary); }
  `,
  select: `
.custom-select { position: relative; width: 100%; max-width: 260px; }
.select-trigger {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 0.625rem 1rem; background-color: var(--bg-secondary);
  border: 1px solid var(--border-color); border-radius: var(--radius-md);
  color: var(--text-primary); font-size: 0.875rem; cursor: pointer; text-align: left;
}
.select-trigger:focus, .custom-select.active .select-trigger { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
.select-chevron { width: 1rem; height: 1rem; color: var(--text-muted); transition: transform var(--transition-normal); }
.custom-select.active .select-chevron { transform: rotate(180deg); color: var(--primary); }
.select-options-container {
  position: absolute; top: calc(100% + 0.5rem); left: 0; width: 100%;
  background-color: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); box-shadow: var(--modal-shadow); padding: 0.375rem;
  opacity: 0; transform: translateY(-8px) scale(0.98); visibility: hidden; transition: all var(--transition-normal); z-index: 50;
}
.custom-select.active .select-options-container { opacity: 1; transform: translateY(0) scale(1); visibility: visible; }
.select-option { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; font-size: 0.875rem; color: var(--text-secondary); border-radius: var(--radius-sm); cursor: pointer; }
.select-option:hover { background-color: var(--bg-tertiary); color: var(--text-primary); }
.select-option.selected { background-color: var(--primary-light); color: var(--primary); font-weight: 600; }
.select-check-icon { width: 1rem; height: 1rem; display: none; }
.select-option.selected .select-check-icon { display: block; }
  `,
  modal: `
.modal-overlay-demo {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity var(--transition-normal);
}
.modal-overlay-demo.active { opacity: 1; pointer-events: auto; }
.modal-content-demo {
  background-color: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); padding: 2rem; width: 90%; max-width: 500px;
  box-shadow: var(--modal-shadow); transform: translateY(20px) scale(0.95);
  transition: transform var(--transition-normal);
}
.modal-overlay-demo.active .modal-content-demo { transform: translateY(0) scale(1); }
.modal-header-demo { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
.modal-footer-demo { display: flex; justify-content: flex-end; gap: 0.75rem; }
  `,
  dialog: `
.dialog-overlay-demo {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity var(--transition-normal);
}
.dialog-overlay-demo.active { opacity: 1; pointer-events: auto; }
.dialog-content-demo {
  background-color: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); padding: 1.75rem; width: 90%; max-width: 400px;
  box-shadow: var(--modal-shadow); transform: scale(0.9); text-align: center;
}
.dialog-overlay-demo.active .dialog-content-demo { transform: scale(1); }
.dialog-icon-demo.danger { background-color: var(--danger-light); color: var(--danger); }
.dialog-footer-demo { display: flex; justify-content: center; gap: 0.75rem; }
  `,
  toast: `
.toast-container { position: fixed; top: 1.5rem; right: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; z-index: 2000; max-width: 350px; width: 100%; }
.toast-demo {
  background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem;
  display: flex; align-items: flex-start; gap: 0.75rem; box-shadow: var(--modal-shadow);
  transform: translateX(120%); transition: all var(--transition-normal); position: relative; overflow: hidden;
}
.toast-demo.show { transform: translateX(0); }
.toast-progress { position: absolute; bottom: 0; left: 0; height: 3px; background-color: var(--primary); width: 100%; transform-origin: left; }
  `,
  tooltip: `
.tooltip-trigger { position: relative; display: inline-block; }
.tooltip-box {
  position: absolute; background-color: #050811; color: white; padding: 0.375rem 0.625rem;
  border-radius: var(--radius-sm); font-size: 0.75rem; white-space: nowrap;
  pointer-events: none; opacity: 0; transition: all var(--transition-fast); z-index: 100;
}
.tooltip-box.top { bottom: calc(100% + 0.5rem); left: 50%; transform: translateX(-50%) translateY(4px); }
.tooltip-trigger:hover .tooltip-box.top { opacity: 1; transform: translateX(-50%) translateY(0); }
.tooltip-box.top::after {
  content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 4px solid transparent; border-top-color: #050811;
}
  `,
  popover: `
.popover-wrapper { position: relative; display: inline-block; }
.popover-box {
  position: absolute; bottom: calc(100% + 0.75rem); left: 50%;
  transform: translateX(-50%) translateY(8px); width: 260px;
  background-color: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); box-shadow: var(--modal-shadow); padding: 1rem;
  opacity: 0; visibility: hidden; transition: all var(--transition-normal); z-index: 90;
}
.popover-wrapper.active .popover-box { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
  `,
  card: `
.card-demo {
  background-color: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); overflow: hidden; max-width: 300px;
  box-shadow: var(--card-shadow); transition: all var(--transition-normal);
}
.card-demo:hover { transform: translateY(-4px); border-color: var(--border-hover); }
.card-img-placeholder { height: 160px; background: linear-gradient(135deg, var(--primary-light), var(--success-light)); display: flex; align-items: center; justify-content: center; }
.card-body-demo { padding: 1.25rem; }
  `,
  table: `
.table-container { width: 100%; overflow-x: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.table-demo { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem; }
.table-demo th { background-color: var(--bg-tertiary); padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); }
.table-demo td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); }
.table-demo tbody tr:hover { background-color: var(--bg-tertiary); }
  `,
  datagrid: `
.datagrid-controls { display: flex; justify-content: space-between; gap: 1rem; width: 100%; margin-bottom: 0.75rem; }
.datagrid-search { max-width: 250px; }
.datagrid-table th.sortable { cursor: pointer; user-select: none; }
.datagrid-table th.sortable:hover { background-color: var(--border-color); }
.sort-icon { margin-left: 0.25rem; display: inline-block; font-size: 0.75rem; }
  `,
  pagination: `
.pagination-demo { display: flex; align-items: center; gap: 0.25rem; }
.page-btn {
  background-color: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);
  width: 2rem; height: 2rem; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 0.8125rem; transition: all var(--transition-fast);
}
.page-btn.active { background-color: var(--primary); border-color: var(--primary); color: white; }
  `,
  tab: `
.tabs-header-demo { display: flex; border-bottom: 1px solid var(--border-color); gap: 1rem; }
.tab-header-btn {
  background: none; border: none; padding: 0.75rem 0.5rem; font-size: 0.875rem;
  font-weight: 600; color: var(--text-muted); cursor: pointer; position: relative;
}
.tab-header-btn.active { color: var(--primary); }
.tab-header-btn.active::after { content: ""; position: absolute; bottom: -1px; left: 0; width: 100%; height: 2px; background-color: var(--primary); }
.tab-pane-demo { display: none; padding: 1rem 0; font-size: 0.875rem; }
.tab-pane-demo.active { display: block; animation: fadeIn 0.3s ease; }
  `,
  accordion: `
.accordion-wrapper { width: 100%; max-width: 500px; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.accordion-item { border-bottom: 1px solid var(--border-color); }
.accordion-trigger { width: 100%; padding: 1rem; background: none; border: none; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
.accordion-trigger i { transition: transform var(--transition-normal); }
.accordion-item.active .accordion-trigger i { transform: rotate(180deg); color: var(--primary); }
.accordion-panel { max-height: 0; overflow: hidden; transition: max-height var(--transition-normal) ease-out; background-color: var(--bg-secondary); }
  `,
  sidebar: `
.sidebar-container-demo { display: flex; height: 200px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.sidebar-demo { width: 150px; background-color: var(--bg-secondary); border-right: 1px solid var(--border-color); padding: 1rem 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; transition: width var(--transition-normal); }
.sidebar-demo.collapsed { width: 50px; }
.sidebar-demo.collapsed .sidebar-text { display: none; }
  `,
  navbar: `
.navbar-demo { width: 100%; background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem 1.25rem; display: flex; justify-content: space-between; align-items: center; }
.navbar-brand-demo { font-family: 'Outfit', sans-serif; font-weight: 700; }
.navbar-links-demo { display: flex; gap: 1rem; list-style: none; }
.navbar-link-demo a { text-decoration: none; font-size: 0.8125rem; color: var(--text-secondary); }
  `,
  drawer: `
.drawer-overlay-demo {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
  z-index: 1000; opacity: 0; pointer-events: none; transition: opacity var(--transition-normal);
}
.drawer-overlay-demo.active { opacity: 1; pointer-events: auto; }
.drawer-content-demo {
  position: absolute; top: 0; right: 0; height: 100%; width: 320px;
  background-color: var(--bg-secondary); border-left: 1px solid var(--border-color);
  box-shadow: var(--modal-shadow); padding: 2rem; transform: translateX(100%);
  transition: transform var(--transition-normal);
}
.drawer-overlay-demo.active .drawer-content-demo { transform: translateX(0); }
  `,
  breadcrumb: `
.breadcrumb-demo { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.8125rem; color: var(--text-muted); }
.breadcrumb-item-demo a { text-decoration: none; color: var(--text-secondary); }
.breadcrumb-item-demo.active { color: var(--text-primary); font-weight: 500; }
  `,
  avatar: `
.avatar-demo { position: relative; display: inline-block; width: 2.5rem; height: 2.5rem; }
.avatar-img-demo { width: 100%; height: 100%; border-radius: var(--radius-full); object-fit: cover; background-color: var(--bg-tertiary); border: 2px solid var(--bg-secondary); display: flex; align-items: center; justify-content: center; }
.avatar-badge-demo { position: absolute; bottom: 0; right: 0; width: 0.625rem; height: 0.625rem; border-radius: var(--radius-full); border: 2px solid var(--bg-secondary); }
.avatar-badge-demo.online { background-color: var(--success); }
  `,
  badge: `
.badge-demo-container { position: relative; display: inline-block; }
.badge-demo {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.6875rem; font-weight: 700; padding: 0.15rem 0.35rem;
  border-radius: var(--radius-full); background-color: var(--danger); color: white;
  position: absolute; top: -4px; right: -8px; border: 1.5px solid var(--bg-secondary);
}
.badge-demo.badge-dot { width: 8px; height: 8px; padding: 0; }
  `,
  chip: `
.chip-demo {
  display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.75rem;
  font-size: 0.75rem; font-weight: 600; border-radius: var(--radius-full);
  background-color: var(--bg-tertiary); border: 1px solid var(--border-color);
}
.chip-demo i { cursor: pointer; border-radius: var(--radius-full); }
.chip-demo i:hover { color: var(--danger); background-color: var(--danger-light); }
  `,
  tag: `
.tag-demo { display: inline-flex; align-items: center; padding: 0.125rem 0.5rem; font-size: 0.75rem; font-weight: 500; border-radius: var(--radius-sm); }
.tag-indigo { background-color: var(--primary-light); color: var(--primary); }
.tag-emerald { background-color: var(--success-light); color: var(--success); }
  `,
  slider: `
.slider-container-demo { width: 100%; max-width: 260px; display: flex; flex-direction: column; gap: 0.5rem; }
.slider-demo { -webkit-appearance: none; width: 100%; height: 6px; border-radius: var(--radius-full); background: var(--border-color); outline: none; }
.slider-demo::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: var(--radius-full); background: var(--primary); cursor: pointer; }
  `,
  progressbar: `
.progress-container-demo { width: 100%; max-width: 300px; display: flex; flex-direction: column; gap: 0.5rem; }
.progress-track { width: 100%; height: 8px; background-color: var(--bg-tertiary); border-radius: var(--radius-full); overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--success)); transition: width var(--transition-normal); }
  `,
  skeleton: `
.skeleton-card { width: 240px; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; background-color: var(--bg-secondary); }
.skeleton-item {
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--border-color) 37%, var(--bg-tertiary) 63%);
  background-size: 400% 100%; animation: skeleton-loading 1.4s ease infinite; border-radius: var(--radius-sm);
}
@keyframes skeleton-loading { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
.skeleton-circle { width: 2.5rem; height: 2.5rem; border-radius: var(--radius-full); }
.skeleton-title { height: 12px; width: 70%; margin-bottom: 0.5rem; }
  `,
  datepicker: `
.datepicker-demo { background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.5rem 0.75rem; color: var(--text-primary); cursor: pointer; outline: none; }
  `,
  fileupload: `
.upload-dropzone { border: 2px dashed var(--border-color); border-radius: var(--radius-md); padding: 2rem 1.5rem; text-align: center; background-color: var(--bg-secondary); cursor: pointer; }
.upload-dropzone.dragover { border-color: var(--primary); background-color: var(--primary-light); }
.uploaded-file-item { display: flex; align-items: center; justify-content: space-between; background-color: var(--bg-tertiary); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); }
  `
};

const JS_TEMPLATES = {
  button: `
// 버튼 컴포넌트는 표준 클릭 이벤트를 받아 동작합니다.
const primaryBtn = document.querySelector('.btn-primary');
primaryBtn.addEventListener('click', () => {
  console.log('Primary Button Clicked!');
});
  `,
  input: `
// 인풋 필드 유효성 검증 예제
const inputField = document.getElementById('demo-input-text');
const formGroup = document.getElementById('demo-form-group');

inputField.addEventListener('input', (e) => {
  const val = e.target.value;
  // 4자 이상 12자 이하 영문/숫자 매칭
  if (val.length > 0 && (val.length < 4 || val.length > 12)) {
    formGroup.classList.add('has-error');
  } else {
    formGroup.classList.remove('has-error');
  }
});
  `,
  checkbox: `
// 체크박스는 다중 체크 상태를 수집하기 용이합니다.
const checkboxes = document.querySelectorAll('.checkbox-input');
checkboxes.forEach(chk => {
  chk.addEventListener('change', (e) => {
    console.log(e.target.value, e.target.checked);
  });
});
  `,
  radio: `
// 라디오는 묶음 그룹 중 선택된 유일한 값을 가져옵니다.
const radios = document.querySelectorAll('.radio-input');
radios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      console.log('선택된 항목:', e.target.value);
    }
  });
});
  `,
  dropdown: `
// 드롭다운 토글 및 바깥 클릭 시 메뉴 닫기 처리
const dropdown = document.getElementById('dropdown-example');
const toggleBtn = document.getElementById('dropdown-toggle-btn');

toggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  dropdown.classList.toggle('active');
});

window.addEventListener('click', () => {
  dropdown.classList.remove('active');
});
  `,
  select: `
// 커스텀 셀렉트 박스 클릭 이벤트 및 바깥 영역 클릭 해제 핸들러
const customSelect = document.getElementById('custom-select-demo');
const trigger = customSelect.querySelector('.select-trigger');
const options = customSelect.querySelectorAll('.select-option');
const valueDisplay = customSelect.querySelector('.select-value');

trigger.addEventListener('click', (e) => {
  e.stopPropagation();
  customSelect.classList.toggle('active');
});

options.forEach(option => {
  option.addEventListener('click', (e) => {
    const text = option.querySelector('span').textContent;
    valueDisplay.textContent = text;
    customSelect.classList.remove('active');
  });
});

window.addEventListener('click', () => {
  customSelect.classList.remove('active');
});
  `,
  modal: `
// 모달 열고 닫기 이벤트 바인딩
const trigger = document.getElementById('modal-trigger-btn');
const modal = document.getElementById('modal-container-element');
const closeBtn = document.getElementById('modal-close-icon-btn');
const cancelBtn = document.getElementById('modal-cancel-element-btn');

const openModal = () => modal.classList.add('active');
const closeModal = () => modal.classList.remove('active');

trigger.addEventListener('click', openModal);
[closeBtn, cancelBtn].forEach(el => el.addEventListener('click', closeModal));

// 모달 바깥 어두운 배경 클릭 시 닫기
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});
  `,
  dialog: `
// 경고 메시지 처리를 위한 단발성 대화상자 제어
const openBtn = document.getElementById('dialog-trigger-btn');
const dialog = document.getElementById('dialog-container-element');
const cancelBtn = document.getElementById('dialog-cancel-element-btn');

openBtn.addEventListener('click', () => dialog.classList.add('active'));
cancelBtn.addEventListener('click', () => dialog.classList.remove('active'));
  `,
  toast: `
// 토스트 생성 및 애니메이션/자동 타이머 소멸 핸들러
function showToast(title, message, type = 'success') {
  const container = document.getElementById('global-toast-container');
  const toast = document.createElement('div');
  toast.className = \`toast-demo toast-\${type}\`;
  
  toast.innerHTML = \`
    <div class="toast-content">
      <div class="toast-title">\${title}</div>
      <div class="toast-message">\${message}</div>
    </div>
    <div class="toast-progress"></div>
  \`;
  
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  
  // 3초 후 자동 파괴
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}
  `,
  popover: `
// 특정 부모 위치를 기준으로 클릭 시 미니 정보 팝업
const popover = document.getElementById('popover-example-wrapper');
const toggle = document.getElementById('popover-toggle-btn');

toggle.addEventListener('click', (e) => {
  e.stopPropagation();
  popover.classList.toggle('active');
});

window.addEventListener('click', (e) => {
  if (!popover.contains(e.target)) {
    popover.classList.remove('active');
  }
});
  `,
  datagrid: `
// 데이터 목록 검색, 필터링 및 정렬 구현
const gridSearch = document.getElementById('grid-search-input');
const statusFilter = document.getElementById('grid-status-filter');
const sortHeader = document.getElementById('sort-name-header');

let isAscending = true;

function renderGrid() {
  const filterText = gridSearch.value.toLowerCase();
  const filterStatus = statusFilter.value;
  
  // filtering logic...
}

sortHeader.addEventListener('click', () => {
  isAscending = !isAscending;
  gridData.sort((a, b) => a.name.localeCompare(b.name) * (isAscending ? 1 : -1));
  renderGrid();
});
  `,
  pagination: `
// 현재 액티브 페이지 인덱스를 스위칭하는 제어 스크립트
const pageBtns = document.querySelectorAll('.page-btn[data-target-page]');
let activePage = 2;

pageBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    activePage = parseInt(btn.getAttribute('data-target-page'));
    // UI 클래스 토글링 진행...
  });
});
  `,
  tab: `
// 탭 버튼 타겟 아이디 판넬 가시성 제어
const tabHeaderBtns = document.querySelectorAll('.tab-header-btn');
const tabPanes = document.querySelectorAll('.tab-pane-demo');

tabHeaderBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-tab-panel');
    
    tabHeaderBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    tabPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === target);
    });
  });
});
  `,
  accordion: `
// 높이scrollHeight 값을 수집하여 동적 전개 애니메이션 연출
const triggers = document.querySelectorAll('.accordion-trigger');

triggers.forEach(trigger => {
  trigger.addEventListener('click', () => {
    const panel = trigger.nextElementSibling;
    const isOpened = trigger.parentElement.classList.toggle('active');
    
    panel.style.maxHeight = isOpened ? (panel.scrollHeight + 'px') : '0px';
  });
});
  `,
  sidebar: `
// 사이드바 너비를 줄여 축소 컴팩트 뷰로 전환하는 기능
const toggle = document.getElementById('demo-sidebar-toggle-action');
const sidebar = document.getElementById('demo-nav-sidebar');

toggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});
  `,
  drawer: `
// 옆에서 서랍 슬라이딩 방식으로 메뉴 밀기
const drawerTrigger = document.getElementById('drawer-trigger-btn');
const drawer = document.getElementById('drawer-container-element');
const closeBtn = document.getElementById('drawer-close-icon-btn');

drawerTrigger.addEventListener('click', () => drawer.classList.add('active'));
closeBtn.addEventListener('click', () => drawer.classList.remove('active'));
  `,
  chip: `
// 칩 개별 삭제 버튼 및 추가 생성
const container = document.getElementById('chip-demo-group-container');

container.addEventListener('click', (e) => {
  if (e.target.classList.contains('chip-remove-trigger')) {
    e.target.closest('.chip-demo').remove();
  }
});
  `,
  slider: `
// 드래그 슬라이더 값 실시간 변경 텍스트 출력
const slider = document.getElementById('demo-slider-bar');
const label = document.getElementById('slider-val-preview');

slider.addEventListener('input', (e) => {
  label.textContent = e.target.value;
});
  `,
  progressbar: `
// 일정 주기로 바 수치를 채워 로딩 완료 시뮬레이션
const button = document.getElementById('progressbar-simulate-btn');
const fill = document.getElementById('progressbar-fill-indicator');

button.addEventListener('click', () => {
  let w = 0;
  const timer = setInterval(() => {
    w += 5;
    fill.style.width = w + '%';
    if (w >= 100) clearInterval(timer);
  }, 100);
});
  `,
  skeleton: `
// 로딩 스켈레톤 홀더 박스와 실제 로드 완료 데이터를 교체
const toggle = document.getElementById('skeleton-toggle-btn');
const realCard = document.getElementById('skeleton-real-card-element');
const skeleton = document.getElementById('skeleton-placeholder-element');

toggle.addEventListener('click', () => {
  const isLoaded = realCard.style.display === 'block';
  realCard.style.display = isLoaded ? 'none' : 'block';
  skeleton.style.display = isLoaded ? 'block' : 'none';
});
  `,
  datepicker: `
// 네이티브 및 달력 선택 컴포넌트 이벤트 캡처
const dateInput = document.getElementById('datepicker-element-input');
dateInput.addEventListener('change', (e) => {
  console.log('선택된 날짜:', e.target.value);
});
  `,
  fileupload: `
// 드래그오버 드롭다운 파일 읽기 및 목록 출력
const dropzone = document.getElementById('dropzone-area-box');
const fileInput = document.getElementById('dropzone-native-input');

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  handleFiles(e.dataTransfer.files);
});
  `
};

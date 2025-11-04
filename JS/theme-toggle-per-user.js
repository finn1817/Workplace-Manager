// Minimal theme toggle stored per browser (localStorage)

const THEME_KEY = 'wp_theme';

function applyTheme(theme) {
	document.documentElement.setAttribute('data-theme', theme);
}

export function initThemeToggle(buttonId = 'themeToggle') {
	const btn = document.getElementById(buttonId);
	if (!btn) return;
	const saved = localStorage.getItem(THEME_KEY) || 'light';
	applyTheme(saved);
	btn.textContent = saved === 'dark' ? 'Light Mode' : 'Dark Mode';
	btn.onclick = () => {
		const current = document.documentElement.getAttribute('data-theme') || 'light';
		const next = current === 'dark' ? 'light' : 'dark';
		applyTheme(next);
		localStorage.setItem(THEME_KEY, next);
		btn.textContent = next === 'dark' ? 'Light Mode' : 'Dark Mode';
	};
}

export default { initThemeToggle };


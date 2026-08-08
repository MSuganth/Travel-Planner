document.addEventListener('DOMContentLoaded', () => {
    // 1. Sticky Navbar
    const navbar = document.querySelector('.navbar');
    let lastScrollY = window.scrollY;
    
    const handleScroll = () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        
        // Hide navbar on scroll down, show on scroll up
        if (window.scrollY > lastScrollY && window.scrollY > 100) {
            navbar.classList.add('nav-hidden');
        } else {
            navbar.classList.remove('nav-hidden');
        }
        lastScrollY = window.scrollY;
    };
    
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check on load

    // 2. Scroll Reveal Animations
    const revealElements = document.querySelectorAll('.reveal, .reveal-up');

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // Optional: Hero section immediate animation Trigger via slight delay
    setTimeout(() => {
        const heroContent = document.querySelector('.hero-content');
        if (heroContent) {
            heroContent.classList.add('active');
        }
    }, 100);

    // 3. Destination Carousel Logic
    const cards = document.querySelectorAll('.destination-card');
    const prevBtn = document.querySelector('.prev-arrow');
    const nextBtn = document.querySelector('.next-arrow');
    let currentIndex = 0;
    let slideInterval;

    const updateSlider = () => {
        cards.forEach((card, index) => {
            card.classList.remove('active', 'prev', 'next');
            if (index === currentIndex) {
                card.classList.add('active');
            } else if (index === (currentIndex - 1 + cards.length) % cards.length) {
                card.classList.add('prev');
            } else if (index === (currentIndex + 1) % cards.length) {
                card.classList.add('next');
            }
        });
    };

    const nextSlide = () => {
        currentIndex = (currentIndex + 1) % cards.length;
        updateSlider();
    };

    const prevSlide = () => {
        currentIndex = (currentIndex - 1 + cards.length) % cards.length;
        updateSlider();
    };

    if (cards.length > 0) {
        // Remove scroll-reveal classes from cards so they don't fight CSS slider transitions
        cards.forEach(card => card.classList.remove('reveal-up'));
        
        updateSlider();
        
        if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); resetInterval(); });
        if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); resetInterval(); });

        cards.forEach((card, index) => {
            card.addEventListener('click', (e) => {
                if (card.classList.contains('prev') || card.classList.contains('next')) {
                    currentIndex = index;
                    updateSlider();
                    resetInterval();
                }
            });
        });

        const startInterval = () => {
            slideInterval = setInterval(nextSlide, 4500); // slide every 4.5 seconds
        };
        const resetInterval = () => {
            clearInterval(slideInterval);
            startInterval();
        };
        startInterval();
    }

    // Check for messages in URL
    const urlParams = new URLSearchParams(window.location.search);
    const msg = urlParams.get('msg');
    
    // Defer the modal opening slightly to ensure DOM is ready and transitions look natural
    if (msg === 'logout') {
        setTimeout(() => {
            openAuthModal('login');
            displayAuthMessage('Logout successful. If you want to continue, login again.', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 100);
    } else if (msg === 'login_required') {
        setTimeout(() => {
            openAuthModal('login');
            displayAuthMessage('Please login to continue.', 'error');
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 100);
    }
});

// --- Modal Logic ---
const authModal = document.getElementById('auth-modal');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.getElementById('modal-subtitle');
const loginForm = document.getElementById('modal-login-form');
const signupForm = document.getElementById('modal-signup-form');
const authMessage = document.getElementById('auth-message');

window.openAuthModal = (mode) => {
    switchAuthMode(mode);
    authModal.classList.add('open');
};

window.closeAuthModal = () => {
    authModal.classList.remove('open');
    // Clear messages and fields on close
    setTimeout(() => {
        authMessage.className = 'auth-message';
        authMessage.textContent = '';
        loginForm.reset();
        signupForm.reset();
    }, 300);
};

// Close modal when clicking outside the container
authModal.addEventListener('click', (e) => {
    if (e.target === authModal) {
        closeAuthModal();
    }
});

window.switchAuthMode = (mode) => {
    authMessage.className = 'auth-message'; // hide any prevailing messages
    
    if (mode === 'login') {
        modalTitle.textContent = 'Welcome Back';
        modalSubtitle.textContent = 'Log in to your account to continue planning.';
        signupForm.classList.remove('active-form');
        signupForm.classList.add('hidden-form');
        loginForm.classList.remove('hidden-form');
        loginForm.classList.add('active-form');
    } else {
        modalTitle.textContent = 'Create Account';
        modalSubtitle.textContent = 'Begin your travel journey with us today.';
        loginForm.classList.remove('active-form');
        loginForm.classList.add('hidden-form');
        signupForm.classList.remove('hidden-form');
        signupForm.classList.add('active-form');
    }
};

const displayAuthMessage = (msg, type) => {
    authMessage.textContent = msg;
    authMessage.className = `auth-message ${type}`;
};

// --- Auth Requests ---

// Login Submit
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch('http://127.0.0.1:5000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const result = await response.json();
        
        if (response.ok) {
            displayAuthMessage('Login successful! Redirecting...', 'success');
            if (result.name) localStorage.setItem('userName', result.name);
            if (result.user_id) localStorage.setItem('userId', result.user_id);
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
        } else {
            displayAuthMessage(result.error || 'Login failed.', 'error');
        }
    } catch (err) {
        displayAuthMessage('Network error. Cannot reach server.', 'error');
    }
});

// Signup Submit
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    try {
        const response = await fetch('http://127.0.0.1:5000/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const result = await response.json();
        
        if (response.ok) {
            displayAuthMessage('Account created! Please login to continue.', 'success');
            setTimeout(() => { 
                switchAuthMode('login'); 
                document.getElementById('login-email').value = email;
                displayAuthMessage('Signup successful. If you want to continue, login again.', 'success');
            }, 1000);
        } else {
            displayAuthMessage(result.error || 'Signup failed.', 'error');
        }
    } catch (err) {
        displayAuthMessage('Network error. Cannot reach server.', 'error');
    }
});

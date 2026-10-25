/**
 * BK MOT CENTRE LTD - Main Interactive JavaScript
 * Lightweight, zero-dependency, works directly in any browser & Cloudflare Pages
 */

function initAll() {
  safeInit('mobileNav', initMobileNav);
  safeInit('openingStatus', initOpeningStatus);
  safeInit('faqAccordion', initFaqAccordion);
  safeInit('contactForm', initContactForm);
  safeInit('quotesSlider', initQuotesSlider);
}

function safeInit(name, fn) {
  try {
    fn();
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) {
      console.error(`[BK MOT] Failed to initialize ${name}:`, err);
    }
  }
}

// Ensure execution whether loaded synchronously, deferred, or via Rocket Loader
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
}

/**
 * Mobile Navigation Toggle
 */
function initMobileNav() {
  const toggleBtn = document.querySelector('.mobile-nav-toggle');
  const siteNav = document.querySelector('.site-nav');

  if (!toggleBtn || !siteNav) return;

  function toggleMenu(forceOpen) {
    const isCurrentlyOpen = siteNav.classList.contains('open');
    const willOpen = typeof forceOpen === 'boolean' ? forceOpen : !isCurrentlyOpen;

    if (willOpen) {
      siteNav.classList.add('open');
      toggleBtn.setAttribute('aria-expanded', 'true');
      siteNav.setAttribute('aria-hidden', 'false');
      if (document.body) document.body.classList.add('nav-open');
    } else {
      siteNav.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      siteNav.setAttribute('aria-hidden', 'true');
      if (document.body) document.body.classList.remove('nav-open');
    }
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!siteNav.contains(e.target) && !toggleBtn.contains(e.target) && siteNav.classList.contains('open')) {
      toggleMenu(false);
    }
  });

  // Close on Escape key press and return focus to toggle button
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && siteNav.classList.contains('open')) {
      toggleMenu(false);
      toggleBtn.focus();
    }
  });

  // Close when clicking any nav or drawer link
  const interactiveLinks = siteNav.querySelectorAll('a');
  interactiveLinks.forEach((link) => {
    link.addEventListener('click', () => {
      toggleMenu(false);
    });
  });

  // Close if window resizes to desktop breakpoint
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1080 && siteNav.classList.contains('open')) {
      toggleMenu(false);
    }
  });
}

/**
 * Live Opening Status Indicator (Based on UK London Time)
 * Hours: Everyday 9:00 AM – 6:00 PM
 */
function initOpeningStatus() {
  const statusBadges = document.querySelectorAll('.live-status-badge');
  if (!statusBadges.length) return;

  function updateStatus() {
    try {
      // Get current time in Europe/London timezone
      const now = new Date();
      const ukTimeString = now.toLocaleString('en-US', { timeZone: 'Europe/London' });
      const ukDate = new Date(ukTimeString);
      const hour = ukDate.getHours();
      const minute = ukDate.getMinutes();

      // Open from 09:00 to 18:00
      const isOpen = hour >= 9 && hour < 18;

      statusBadges.forEach((badge) => {
        const dot = badge.querySelector('.status-dot');
        const text = badge.querySelector('.status-text');

        if (isOpen) {
          if (dot) dot.style.backgroundColor = '#10b981';
          if (text) text.textContent = 'Open Today: 9am – 6pm';
          badge.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
          badge.style.color = '#34d399';
        } else {
          if (dot) dot.style.backgroundColor = '#f59e0b';
          if (text) text.textContent = 'Closed Now • Opens 9am';
          badge.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
          badge.style.color = '#fbbf24';
        }
      });
    } catch (e) {
      // Fallback
      statusBadges.forEach((badge) => {
        const text = badge.querySelector('.status-text');
        if (text) text.textContent = 'Open Everyday: 9am – 6pm';
      });
    }
  }

  updateStatus();
  // Refresh status every 5 minutes
  setInterval(updateStatus, 300000);
}

/**
 * FAQ Accordion for DPF Cleaning page
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item, .dpf-accordion-item');
  if (!faqItems.length) return;

  faqItems.forEach((item) => {
    const question = item.querySelector('.faq-question, .dpf-accordion-header');
    if (!question) return;

    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      // Close all other items in same accordion
      const parentAccordion = item.closest('.faq-accordion, .dpf-accordion');
      const siblings = parentAccordion ? parentAccordion.querySelectorAll('.faq-item, .dpf-accordion-item') : faqItems;

      siblings.forEach((other) => {
        if (other !== item) {
          other.classList.remove('active');
          const header = other.querySelector('.faq-question, .dpf-accordion-header');
          if (header) header.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle clicked item
      item.classList.toggle('active', !isActive);
      question.setAttribute('aria-expanded', !isActive ? 'true' : 'false');
    });
  });
}

/**
 * Contact & Booking Form Submission (Cloudflare Workers API + Resend integration)
 */
function initContactForm() {
  const form = document.getElementById('contact-form') || 
               document.getElementById('contact-page-form') || 
               document.querySelector('form.contact-form-inner') ||
               document.querySelector('form[action="/api/contact"]');
  const messageBox = document.getElementById('form-feedback');

  if (!form) return;

  // Prevent duplicate event listener registration
  if (form.dataset.contactFormBound === 'true') return;
  form.dataset.contactFormBound = 'true';

  form.addEventListener('submit', async (e) => {
    // 1. Immediately prevent native form submission / document navigation
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Send Message';

    // Form inputs
    const nameInput = form.querySelector('[name="name"]');
    const phoneInput = form.querySelector('[name="phone"]');
    const emailInput = form.querySelector('[name="email"]');
    const serviceInput = form.querySelector('[name="service"]');
    const messageInput = form.querySelector('[name="message"]');

    const name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const service = serviceInput ? serviceInput.value.trim() : '';
    const message = messageInput ? messageInput.value.trim() : '';

    // Client-side validations
    if (!name || name.length < 2) {
      showFeedback('Please enter your full name (at least 2 characters).', 'error');
      if (nameInput) nameInput.focus();
      return;
    }

    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (!phone || digitsOnly.length < 7 || digitsOnly.length > 15) {
      showFeedback('Please provide a valid phone number so our garage can reach you (7 to 15 digits).', 'error');
      if (phoneInput) phoneInput.focus();
      return;
    }

    if (email) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        showFeedback('Please enter a valid email address (e.g. name@example.co.uk).', 'error');
        if (emailInput) emailInput.focus();
        return;
      }
    }

    if (!service) {
      showFeedback('Please select the service required from the dropdown.', 'error');
      if (serviceInput) serviceInput.focus();
      return;
    }

    if (!message || message.length < 5) {
      showFeedback('Please provide a brief message about your vehicle enquiry (at least 5 characters).', 'error');
      if (messageInput) messageInput.focus();
      return;
    }

    // Turnstile token extraction (supports both DOM hidden input and JS API)
    let turnstileToken = '';
    const turnstileField = form.querySelector('[name="cf-turnstile-response"]');
    if (turnstileField && turnstileField.value) {
      turnstileToken = turnstileField.value.trim();
    } else if (typeof turnstile !== 'undefined') {
      try {
        turnstileToken = turnstile.getResponse() || '';
      } catch (tErr) {}
    }

    if (!turnstileToken && form.querySelector('.cf-turnstile')) {
      showFeedback('Please complete the Cloudflare security verification check before sending.', 'error');
      return;
    }

    // Generate or reuse stable submissionId for safe idempotency
    if (!form.dataset.submissionId) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        form.dataset.submissionId = crypto.randomUUID();
      } else {
        form.dataset.submissionId = 'sub_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      }
    }
    const submissionId = form.dataset.submissionId;

    // Prevent duplicate submission
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Sending Enquiry...';
      submitBtn.setAttribute('aria-busy', 'true');
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          submissionId,
          name,
          phone,
          email,
          service,
          message,
          turnstileToken,
          timestamp: new Date().toISOString()
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        showFeedback(data.message || 'Thank you! Your enquiry has been received. Our team will contact you shortly to confirm your booking date and time.', 'success');
        form.reset();
        delete form.dataset.submissionId;
        // Reset turnstile if present
        if (typeof turnstile !== 'undefined') {
          try { turnstile.reset(); } catch {}
        }
      } else {
        // Honest error message: user input is preserved (do not reset form)
        // Note: If turnstile failed, user needs a new token for next attempt
        if (typeof turnstile !== 'undefined') {
          try { turnstile.reset(); } catch {}
        }
        const errorMsg = data.error || 'Online dispatch is currently unavailable. Please call us directly on 0121 558 9215 to book immediately.';
        showFeedback(errorMsg, 'error');
      }
    } catch (err) {
      // Network/offline failure: user input is preserved
      showFeedback('Connection error. Please call us directly on 0121 558 9215 to book your slot.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        submitBtn.removeAttribute('aria-busy');
      }
    }
  });

  function showFeedback(text, type) {
    if (!messageBox) {
      alert(text);
      return;
    }
    messageBox.textContent = text;
    messageBox.className = `form-message ${type}`;
    messageBox.style.display = 'block';
    messageBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Customer Promise Quotes Slider for About Us page
 */
function initQuotesSlider() {
  const slider = document.getElementById('about-quotes-slider');
  if (!slider) return;

  const slides = slider.querySelectorAll('.quote-slide');
  const dots = document.querySelectorAll('.slider-pagination-dots .slider-dot');
  if (!slides.length) return;

  let currentIndex = 0;
  let autoplayInterval = null;

  function showSlide(index) {
    currentIndex = index;
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === index);
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  function nextSlide() {
    const next = (currentIndex + 1) % slides.length;
    showSlide(next);
  }

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      showSlide(index);
      resetAutoplay();
    });
  });

  function startAutoplay() {
    autoplayInterval = setInterval(nextSlide, 5000);
  }

  function resetAutoplay() {
    clearInterval(autoplayInterval);
    startAutoplay();
  }

  startAutoplay();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initAll,
    initContactForm,
    initMobileNav,
    initOpeningStatus,
    initFaqAccordion,
    initQuotesSlider
  };
}

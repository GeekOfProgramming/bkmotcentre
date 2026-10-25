/**
 * BK MOT CENTRE LTD - Main Interactive JavaScript
 * Lightweight, zero-dependency, works directly in any browser & Cloudflare Pages
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initOpeningStatus();
  initFaqAccordion();
  initContactForm();
  initQuotesSlider();
});

/**
 * Mobile Navigation Toggle
 */
function initMobileNav() {
  const toggleBtn = document.querySelector('.mobile-nav-toggle');
  const siteNav = document.querySelector('.site-nav');

  if (!toggleBtn || !siteNav) return;

  toggleBtn.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!siteNav.contains(e.target) && !toggleBtn.contains(e.target) && siteNav.classList.contains('open')) {
      siteNav.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Close when clicking a link
  const navLinks = siteNav.querySelectorAll('.nav-link');
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      siteNav.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    });
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
  const form = document.getElementById('contact-form') || document.getElementById('contact-page-form');
  const messageBox = document.getElementById('form-feedback');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

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

    // Turnstile token if widget is active
    let turnstileToken = '';
    if (typeof turnstile !== 'undefined') {
      try {
        turnstileToken = turnstile.getResponse() || '';
      } catch (tErr) {
        // Turnstile optional if not initialized
      }
    }

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
        // Reset turnstile if present
        if (typeof turnstile !== 'undefined') {
          try { turnstile.reset(); } catch {}
        }
      } else {
        // Honest error message: user input is preserved (do not reset form)
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

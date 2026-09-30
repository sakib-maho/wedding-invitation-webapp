import { video } from './video.js';
import { image } from './image.js';
import { audio } from './audio.js';
import { progress } from './progress.js';
import { util } from '../../common/util.js';
import { bs } from '../../libs/bootstrap.js';
import { loader } from '../../libs/loader.js';
import { theme } from '../../common/theme.js';
import { lang } from '../../common/language.js';
import { storage } from '../../common/storage.js';
import { session } from '../../common/session.js';
import { offline } from '../../common/offline.js';
import { comment } from '../components/comment.js';
import * as confetti from '../../libs/confetti.js';
import { pool } from '../../connection/request.js';

export const guest = (() => {

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let information = null;

    /**
     * @returns {void}
     */
    const countDownDate = () => {
        // Parse the target date/time from data-time attribute
        // Event: Saturday, January 17, 2026 at 11:00 AM JST (UTC+9)
        // Format: "2026-01-17 11:00:00" (assumed to be JST)
        const timeString = document.body.getAttribute('data-time');
        let targetTimeUTC;
        
        // Check if timezone is already specified (ISO 8601 format)
        if (timeString.includes('+') || timeString.includes('Z') || (timeString.includes('-') && timeString.match(/[+-]\d{2}:\d{2}$/))) {
            // Already has timezone, parse directly
            targetTimeUTC = new Date(timeString).getTime();
        } else {
            // No timezone specified - assume JST (UTC+9) for wedding events
            // Replace space with T and add JST timezone offset
            const jstTimeString = timeString.replace(' ', 'T') + '+09:00';
            targetTimeUTC = new Date(jstTimeString).getTime();
            
            // Verify the date was parsed correctly
            if (isNaN(targetTimeUTC)) {
                console.error('Invalid date format:', timeString);
                // Fallback: try parsing as local time (not recommended)
                targetTimeUTC = new Date(timeString.replace(' ', 'T')).getTime();
            }
        }

        /**
         * @param {number} num 
         * @returns {string}
         */
        const pad = (num) => num < 10 ? `0${num}` : `${num}`;

        const day = document.getElementById('day');
        const hour = document.getElementById('hour');
        const minute = document.getElementById('minute');
        const second = document.getElementById('second');

        const updateCountdown = () => {
            // Use UTC time for calculation to ensure consistency across timezones
            // Date.now() returns milliseconds since epoch in UTC
            // targetTimeUTC is also in UTC (milliseconds since epoch)
            // This ensures all users see the same countdown regardless of their timezone
            const nowUTC = Date.now();
            const distance = targetTimeUTC - nowUTC;

            // If event has passed, show zeros and stop the timer
            if (distance <= 0) {
                day.textContent = '00';
                hour.textContent = '00';
                minute.textContent = '00';
                second.textContent = '00';
                return;
            }

            // Event is in the future, show countdown
            // Calculate time remaining (works the same for all timezones)
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            day.textContent = pad(days);
            hour.textContent = pad(hours);
            minute.textContent = pad(minutes);
            second.textContent = pad(seconds);

            // Update every second, synchronized to the second boundary
            util.timeOut(updateCountdown, 1000 - (Date.now() % 1000));
        };

        util.timeOut(updateCountdown);
    };

    /**
     * @returns {void}
     */
    const showGuestName = () => {
        /**
         * Make sure "to=" is the last query string.
         * Ex. ulems.my.id/?id=some-uuid-here&to=name
         */
        const raw = window.location.search.split('to=');
        let name = null;

        if (raw.length > 1 && raw[1].length >= 1) {
            // Get only the name part, stop at the next & parameter
            const namePart = raw[1].split('&')[0];
            name = window.decodeURIComponent(namePart);
        }

        // Get title from URL parameter
        const titleMatch = window.location.search.match(/[?&]title=([^&]+)/);
        const title = titleMatch ? window.decodeURIComponent(titleMatch[1]) : null;

        // Get prefix from URL parameter
        const prefixMatch = window.location.search.match(/[?&]prefix=([^&]+)/);
        const prefix = prefixMatch ? window.decodeURIComponent(prefixMatch[1]) : null;

        if (name) {
            const guestName = document.getElementById('guest-name');
            const div = document.createElement('div');
            div.classList.add('m-2');

            // Check if title is empty or default placeholder
            const isEmptyTitle = !title || title.trim() === '' || title === 'Mr./Mrs./Brother/Sister';

            // Build title text: prefix + title (e.g., "To Mr.", "Dear Sister")
            // If title is empty, only show prefix
            let titleText = '';
            if (isEmptyTitle) {
                // Only prefix, no title
                if (prefix) {
                    titleText = prefix;
                } else {
                    // Default to "To" if no prefix and no title
                    titleText = 'To';
                }
            } else {
                // Both prefix and title
                if (prefix) {
                    titleText = `${prefix} ${title}`;
                } else {
                    // Default prefix is "To" if only title is provided
                    titleText = `To ${title}`;
                }
            }
            
            // Update data-message attribute if prefix or title is provided
            if ((prefix || title) && guestName) {
                guestName.setAttribute('data-message', titleText);
            }

            const template = `<small class="mt-0 mb-1 mx-0 p-0">${util.escapeHtml(titleText)}</small><p class="m-0 p-0" style="font-size: 1.25rem">${util.escapeHtml(name)}</p>`;
            util.safeInnerHTML(div, template);

            guestName?.appendChild(div);
        }

        const form = document.getElementById('form-name');
        if (form) {
            // Only set value from URL parameter, not from storage, so placeholder shows when empty
            if (name) {
                form.value = name;
            }
            // Don't set from storage to allow placeholder to show
        }
    };

    /**
     * @type {boolean}
     */
    let desktopSlideshowStarted = false;

    /**
     * Simple slideshow - clean implementation
     * Each image stays for 3 seconds with smooth fade transition
     * @returns {Promise<void>}
     */
    const slide = async () => {
        if (desktopSlideshowStarted) {
            return;
        }

        const slides = document.querySelectorAll('.desktop-slide-img');
        const transitionDuration = 2500; // 2.5 seconds for transition
        const displayDuration = 3000; // 3 seconds to display each image
        const interval = displayDuration + transitionDuration; // Total time per slide

        if (!slides || slides.length === 0) {
            return;
        }

        const desktopEl = document.getElementById('root')?.querySelector('.d-sm-block');
        if (!desktopEl) {
            return;
        }

        if (window.getComputedStyle(desktopEl).display === 'none') {
            return;
        }

        desktopSlideshowStarted = true;

        // Wait for all images to load before starting slideshow
        const waitForImages = () => {
            return Promise.all(
                Array.from(slides).map((slideElement) => {
                    return new Promise((resolve) => {
                        if (slideElement.complete && slideElement.naturalWidth > 0) {
                            resolve();
                        } else {
                            slideElement.onload = resolve;
                            slideElement.onerror = resolve; // Continue even if image fails
                        }
                    });
                })
            );
        };

        await waitForImages();

        // Show first slide immediately
        if (slides.length > 0) {
            slides[0].classList.add('active');
        }

        // If only one slide, don't animate
        if (slides.length === 1) {
            return;
        }

        let currentIndex = 0;
        let isRunning = true;

        const nextSlide = () => {
            if (!isRunning) {
                return;
            }

            // Start fading out current slide
            slides[currentIndex].classList.remove('active');

            // Move to next slide
            currentIndex = (currentIndex + 1) % slides.length;

            // Start fading in next slide immediately for smooth crossfade
            // Both transitions happen simultaneously (crossfade effect)
            slides[currentIndex].classList.add('active');
        };

        // Stop slideshow when element is hidden
        desktopEl.addEventListener('undangan.slide.stop', () => {
            isRunning = false;
        });

        // Start slideshow loop
        const startSlideshow = () => {
            if (isRunning) {
                nextSlide();
                util.timeOut(startSlideshow, interval);
            }
        };

        // Wait before starting the slideshow to show first image
        util.timeOut(startSlideshow, displayDuration);
    };

    /**
     * @param {HTMLButtonElement} button
     * @returns {void}
     */
    const open = (button) => {
        button.disabled = true;
        
        // Hide welcome page
        util.changeOpacity(document.getElementById('welcome'), false).then((el) => el.remove());
        
        // Show GIF first, then show next page after GIF disappears
        const jinniOverlay = document.getElementById('jinni-overlay');
        const root = document.getElementById('root');
        
        if (jinniOverlay) {
            // Show root page immediately so it's visible behind the GIF
            root.classList.remove('opacity-0');
            root.style.opacity = '0';
            root.style.transition = 'opacity 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            root.classList.add('fade-in');
            
            // Smooth fade-in with requestAnimationFrame
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    root.style.opacity = '1';
                });
            });
            
            // Show GIF overlay immediately
            jinniOverlay.style.display = 'flex';
            jinniOverlay.style.opacity = '0';
            jinniOverlay.style.transition = 'opacity 1.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            
            // Get video and play it after overlay is visible
            const videoElement = jinniOverlay.querySelector('video');
            if (videoElement) {
                // Set video source based on screen size
                const isDesktop = window.innerWidth >= 768;
                const videoSource = videoElement.querySelector('source');
                
                if (isDesktop && videoSource) {
                    // Desktop: use Aladdin & Jasmine video
                    videoSource.src = './assets/images/aladdin-jasmine-desktop.mp4';
                    videoElement.load(); // Reload video with new source
                } else if (!isDesktop && videoSource) {
                    // Mobile: use jinni animation
                    videoSource.src = './assets/images/jinni-animation.mp4';
                    videoElement.load();
                }
                
                videoElement.muted = true; // Mute the video
                videoElement.volume = 1.0;
                
                // Wait for video to load before playing (for desktop)
                if (isDesktop) {
                    videoElement.addEventListener('canplay', () => {
                        setTimeout(() => {
                            videoElement.play().then(() => {
                                // Desktop video playing successfully
                            }).catch(err => {
                                console.warn('Desktop video play failed:', err);
                                setTimeout(() => {
                                    videoElement.play().catch(e => console.error('Video retry failed:', e));
                                }, 500);
                            });
                        }, 100);
                    }, { once: true });
                } else {
                    // Mobile: small delay to ensure overlay is visible before playing
                    setTimeout(() => {
                        videoElement.play().then(() => {
                            // Mobile video playing successfully
                        }).catch(err => {
                            console.warn('Mobile video play failed:', err);
                            // Retry once
                            setTimeout(() => {
                                videoElement.play().catch(e => console.error('Video retry failed:', e));
                            }, 200);
                        });
                    }, 50);
                }
            }
            
            // Fade in jinni smoothly
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    jinniOverlay.style.opacity = '1';
                });
            });
            
            // After video duration, fade out GIF overlay
            // Desktop: 10.5 seconds, Mobile: 6.5 seconds
            const videoDuration = window.innerWidth >= 768 ? 10500 : 6500;
            setTimeout(() => {
                // Fade out GIF overlay
                jinniOverlay.style.transition = 'opacity 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                jinniOverlay.style.opacity = '0';
                
                setTimeout(() => {
                    jinniOverlay.style.display = 'none';
                }, 1200);
            }, videoDuration);
        } else {
            // Fallback if GIF not found
            root.classList.remove('opacity-0');
        }

        document.body.scrollIntoView({ behavior: 'instant' });

        if (theme.isAutoMode()) {
            document.getElementById('button-theme').classList.remove('d-none');
        }

        slide();
        theme.spyTop();

        confetti.basicAnimation();
        util.timeOut(confetti.openAnimation, 1500);

        document.dispatchEvent(new Event('undangan.open'));
    };

    /**
     * @param {HTMLImageElement} img
     * @returns {void}
     */
    const modal = (img) => {
        document.getElementById('button-modal-click').setAttribute('href', img.src);
        document.getElementById('button-modal-download').setAttribute('data-src', img.src);

        const i = document.getElementById('show-modal-image');
        i.src = img.src;
        i.width = img.width;
        i.height = img.height;
        bs.modal('modal-image').show();
    };

    /**
     * @returns {void}
     */
    const modalImageClick = () => {
        document.getElementById('show-modal-image').addEventListener('click', (e) => {
            const abs = e.currentTarget.parentNode.querySelector('.position-absolute');

            abs.classList.contains('d-none')
                ? abs.classList.replace('d-none', 'd-flex')
                : abs.classList.replace('d-flex', 'd-none');
        });
    };

    /**
     * @param {HTMLDivElement} div 
     * @returns {void}
     */
    const showStory = (div) => {
        if (navigator.vibrate) {
            navigator.vibrate(500);
        }

        confetti.tapTapAnimation(div, 100);
        util.changeOpacity(div, false).then((e) => e.remove());
    };

    /**
     * @returns {void}
     */
    const closeInformation = () => information.set('info', true);

    /**
     * @returns {void}
     */
    const normalizeArabicFont = () => {
        document.querySelectorAll('.font-arabic').forEach((el) => {
            el.innerHTML = String(el.innerHTML).normalize('NFC');
        });
    };

    /**
     * @returns {void}
     */
    const animateSvg = () => {
        document.querySelectorAll('svg').forEach((el) => {
            if (el.hasAttribute('data-class')) {
                util.timeOut(() => el.classList.add(el.getAttribute('data-class')), parseInt(el.getAttribute('data-time')));
            }
        });
    };

    /**
     * @returns {void}
     */
    const buildGoogleCalendar = () => {
        /**
         * Format a JST wall-clock time for Google Calendar.
         * The guest config has no timezone, so do not parse this as UTC.
         * @param {string} d
         * @returns {string}
         */
        const formatDate = (d) => {
            const [date, time] = d.split(' ');
            const [hour, minute] = time.split(':');
            return `${date.replace(/-/g, '')}T${hour}${minute}00`;
        };

        const url = new URL('https://calendar.google.com/calendar/render');
        const data = new URLSearchParams({
            action: 'TEMPLATE',
            text: 'The Wedding of Sakib and Shabrina',
            dates: `${formatDate('2026-01-17 11:00')}/${formatDate('2026-01-17 12:30')}`,
            details: 'With great respect, we invite you to attend our wedding ceremony.',
            location: 'Tokyo Camii & Diyanet Turkish Culture Center, 1-19 Ōyamachō, Shibuya, Tokyo 151-0065',
            ctz: 'Asia/Tokyo',
        });

        url.search = data.toString();
        document.querySelector('#home button')?.addEventListener('click', () => window.open(url, '_blank'));
    };

    /**
     * @returns {object}
     */
    const loaderLibs = () => {
        progress.add();

        /**
         * @param {{aos: boolean, confetti: boolean}} opt
         * @returns {void}
         */
        const load = (opt) => {
            loader(opt)
                .then(() => progress.complete('libs'))
                .catch(() => progress.invalid('libs'));
        };

        return {
            load,
        };
    };

    /**
     * @type {number}
     */
    let pageLoadStartTime = Date.now();

    /**
     * @returns {Promise<void>}
     */
    const booting = async () => {
        animateSvg();
        countDownDate();
        showGuestName();
        modalImageClick();
        normalizeArabicFont();
        buildGoogleCalendar();

        if (information.has('presence')) {
            document.getElementById('form-presence').value = information.get('presence') ? '1' : '2';
        }

        if (information.get('info')) {
            document.getElementById('information')?.remove();
        }

        // Ensure loading page stays visible for at least 4 seconds
        const elapsedTime = Date.now() - pageLoadStartTime;
        const minDisplayTime = 4000; // 4 seconds
        const remainingTime = Math.max(0, minDisplayTime - elapsedTime);
        
        if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingTime));
        }

        // wait until welcome screen is show.
        await util.changeOpacity(document.getElementById('welcome'), true);

        // remove loading screen and show welcome screen.
        await util.changeOpacity(document.getElementById('loading'), false).then((el) => el.remove());
    };

    /**
     * @returns {void}
     */
    const pageLoaded = () => {
        // Track page load start time
        pageLoadStartTime = Date.now();
        
        lang.init();
        offline.init();
        comment.init();
        progress.init();

        information = storage('information');

        const vid = video.init();
        const img = image.init();
        const aud = audio.init();
        const lib = loaderLibs();
        const token = document.body.getAttribute('data-key');
        const params = new URLSearchParams(window.location.search);

        window.addEventListener('resize', util.debounce(slide));
        document.addEventListener('undangan.progress.done', () => booting());
        document.addEventListener('hide.bs.modal', () => document.activeElement?.blur());
        document.getElementById('button-modal-download').addEventListener('click', (e) => {
            img.download(e.currentTarget.getAttribute('data-src'));
        });

        if (!token || token.length <= 0) {
            document.getElementById('comment')?.remove();
            document.querySelector('a.nav-link[href="#comment"]')?.closest('li.nav-item')?.remove();

            vid.load();
            img.load();
            aud.load();
            lib.load({ confetti: document.body.getAttribute('data-confetti') === 'true' });
        }

        if (token && token.length > 0) {
            // add 2 progress for config and comment.
            // before img.load();
            progress.add();
            progress.add();

            // if don't have data-src.
            if (!img.hasDataSrc()) {
                img.load();
            }

            session.guest(params.get('k') ?? token).then(({ data }) => {
                document.dispatchEvent(new Event('undangan.session'));
                progress.complete('config');

                if (img.hasDataSrc()) {
                    img.load();
                }

                vid.load();
                aud.load();
                lib.load({ confetti: data.is_confetti_animation });

                comment.show()
                    .then(() => progress.complete('comment'))
                    .catch(() => progress.invalid('comment'));

            }).catch(() => progress.invalid('config'));
        }
    };

    /**
     * @returns {object}
     */
    const init = () => {
        theme.init();
        session.init();

        if (session.isAdmin()) {
            storage('user').clear();
            storage('owns').clear();
            storage('likes').clear();
            storage('session').clear();
            storage('comment').clear();
        }

        window.addEventListener('load', () => {
            pool.init(pageLoaded, [
                'image',
                'video',
                'audio',
                'libs',
                'gif',
            ]);
        });

        return {
            util,
            theme,
            comment,
            guest: {
                open,
                modal,
                showStory,
                closeInformation,
            },
        };
    };

    return {
        init,
    };
})();
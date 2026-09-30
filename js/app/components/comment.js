import { gif } from './gif.js';
import { card } from './card.js';
import { like } from './like.js';
import { util } from '../../common/util.js';
import { pagination } from './pagination.js';
import { dto } from '../../connection/dto.js';
import { lang } from '../../common/language.js';
import { storage } from '../../common/storage.js';
import { session } from '../../common/session.js';
import { request, HTTP_GET, HTTP_POST, HTTP_DELETE, HTTP_PUT, HTTP_STATUS_CREATED, cacheWrapper, cacheRequest } from '../../connection/request.js';

export const comment = (() => {

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let owns = null;

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let showHide = null;

    /**
     * @type {HTMLElement|null}
     */
    let comments = null;

    /**
     * @type {string[]}
     */
    const lastRender = [];

    /**
     * @returns {string}
     */
    const onNullComment = () => {
        return '';
    };

    /**
     * @param {string} id 
     * @param {boolean} disabled 
     * @returns {void}
     */
    const changeActionButton = (id, disabled) => {
        document.querySelector(`[data-button-action="${id}"]`).childNodes.forEach((e) => {
            e.disabled = disabled;
        });
    };

    /**
     * @param {string} id
     * @returns {void}
     */
    const removeInnerForm = (id) => {
        changeActionButton(id, false);
        document.getElementById(`inner-${id}`).remove();
    };

    /**
     * @param {HTMLButtonElement} button 
     * @returns {void}
     */
    const showOrHide = (button) => {
        const ids = button.getAttribute('data-uuids').split(',');
        const isShow = button.getAttribute('data-show') === 'true';
        const uuid = button.getAttribute('data-uuid');
        const currentShow = showHide.get('show');

        button.setAttribute('data-show', isShow ? 'false' : 'true');
        button.innerText = isShow ? `Show replies (${ids.length})` : 'Hide replies';
        showHide.set('show', isShow ? currentShow.filter((i) => i !== uuid) : [...currentShow, uuid]);

        for (const id of ids) {
            showHide.set('hidden', showHide.get('hidden').map((i) => {
                if (i.uuid === id) {
                    i.show = !isShow;
                }

                return i;
            }));

            document.getElementById(id).classList.toggle('d-none', isShow);
        }
    };

    /**
     * @param {HTMLAnchorElement} anchor 
     * @param {string} uuid 
     * @returns {void}
     */
    const showMore = (anchor, uuid) => {
        const content = document.getElementById(`content-${uuid}`);
        const original = util.base64Decode(content.getAttribute('data-comment'));
        const isCollapsed = anchor.getAttribute('data-show') === 'false';

        util.safeInnerHTML(content, util.convertMarkdownToHTML(util.escapeHtml(isCollapsed ? original : original.slice(0, card.maxCommentLength) + '...')));
        anchor.innerText = isCollapsed ? 'Show less' : 'Read more';
        anchor.setAttribute('data-show', isCollapsed ? 'true' : 'false');
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} c
     * @returns {Promise<void>}
     */
    const fetchTracker = (c) => {
        // IP and user agent tracking disabled - no longer displayed in frontend
        return Promise.resolve();
    };

    /**
     * @param {ReturnType<typeof dto.getCommentsResponse>} items 
     * @param {ReturnType<typeof dto.commentShowMore>[]} hide 
     * @returns {ReturnType<typeof dto.commentShowMore>[]}
     */
    const traverse = (items, hide = []) => {
        const dataShow = showHide.get('show');

        const buildHide = (lists) => lists.forEach((item) => {
            if (hide.find((i) => i.uuid === item.uuid)) {
                buildHide(item.comments);
                return;
            }

            hide.push(dto.commentShowMore(item.uuid));
            buildHide(item.comments);
        });

        const setVisible = (lists) => lists.forEach((item) => {
            if (!dataShow.includes(item.uuid)) {
                setVisible(item.comments);
                return;
            }

            item.comments.forEach((c) => {
                const i = hide.findIndex((h) => h.uuid === c.uuid);
                if (i !== -1) {
                    hide[i].show = true;
                }
            });

            setVisible(item.comments);
        });

        buildHide(items);
        setVisible(items);

        return hide;
    };

    /**
     * @returns {Promise<ReturnType<typeof dto.getCommentsResponse>>}
     */
    const show = () => {

        // remove all event listener.
        lastRender.forEach((u) => {
            like.removeListener(u);
        });

        if (comments.getAttribute('data-loading') === 'false') {
            comments.setAttribute('data-loading', 'true');
            comments.innerHTML = card.renderLoading().repeat(pagination.getPer());
        }

        return request(HTTP_GET, `/api/v2/comment?per=${pagination.getPer()}&next=${pagination.getNext()}&lang=${lang.getLanguage()}`)
            .token(session.getToken())
            .withCache(1000 * 60 * 5) // Reduced to 5 minutes instead of 24 hours
            .send(dto.getCommentsResponseV2)
            .then(async (res) => {
                comments.setAttribute('data-loading', 'false');

                for (const u of lastRender) {
                    await gif.remove(u);
                }

                if (res.data.lists.length === 0) {
                    comments.innerHTML = onNullComment();
                    return res;
                }

                const flatten = (ii) => ii.flatMap((i) => [i.uuid, ...flatten(i.comments)]);
                lastRender.splice(0, lastRender.length, ...flatten(res.data.lists));
                showHide.set('hidden', traverse(res.data.lists, showHide.get('hidden')));

                let data = await card.renderContentMany(res.data.lists);
                if (res.data.lists.length < pagination.getPer()) {
                    data += onNullComment();
                }

                util.safeInnerHTML(comments, data);

                lastRender.forEach((u) => {
                    like.addListener(u);
                });

                return res;
            })
            .catch(async (err) => {
                comments.setAttribute('data-loading', 'false');
                
                // Handle rate limit errors gracefully - try to use cached data
                if (err.status === 429 || err.code === 429) {
                    // Try to load from cache even if expired
                    try {
                        const cw = cacheWrapper(cacheRequest);
                        const cacheKey = new URL(`/api/v2/comment?per=${pagination.getPer()}&next=${pagination.getNext()}&lang=${lang.getLanguage()}`, document.body.getAttribute('data-url'));
                        
                        const cachedRes = await cw.has(cacheKey);
                        if (cachedRes) {
                            console.warn('Using cached comments due to rate limit');
                            const json = await cachedRes.json();
                            const res = { code: 200, data: dto.getCommentsResponseV2(json.data) };
                            
                            // Render cached comments
                            if (res.data.lists.length === 0) {
                                comments.innerHTML = onNullComment();
                                return res;
                            }

                            const flatten = (ii) => ii.flatMap((i) => [i.uuid, ...flatten(i.comments)]);
                            lastRender.splice(0, lastRender.length, ...flatten(res.data.lists));
                            showHide.set('hidden', traverse(res.data.lists, showHide.get('hidden')));

                            let data = await card.renderContentMany(res.data.lists);
                            if (res.data.lists.length < pagination.getPer()) {
                                data += onNullComment();
                            }

                            util.safeInnerHTML(comments, data);

                            lastRender.forEach((u) => {
                                like.addListener(u);
                            });
                            
                            return res;
                        }
                    } catch (cacheErr) {
                        console.warn('Cache retrieval failed:', cacheErr);
                    }
                    
                    // No cache available, show friendly message
                    const cachedContent = comments.innerHTML;
                    if (cachedContent && !cachedContent.includes('skeleton-card')) {
                        return null;
                    }
                    comments.innerHTML = `<div class="alert alert-warning rounded-4 shadow-sm p-3">
                        <p class="mb-0">${err.message || '🟨 Too many requests. Please try again later.'}</p>
                        <small class="text-muted">Comments are cached and will refresh automatically when available.</small>
                    </div>`;
                    return null;
                }
                
                // Re-throw other errors
                throw err;
            })
            .then(async (res) => {
                // Skip if rate limit error was handled
                if (res === null) {
                    return;
                }
                
                comments.dispatchEvent(new Event('undangan.comment.result'));

                if (res.data.lists && session.isAdmin()) {
                    // Batch IP lookups with delay to prevent overwhelming the API
                    for (let i = 0; i < res.data.lists.length; i++) {
                        await fetchTracker(res.data.lists[i]);
                        // Add small delay between IP lookups to prevent rate limiting
                        if (i < res.data.lists.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                }

                pagination.setTotal(res.data.count);
                comments.dispatchEvent(new Event('undangan.comment.done'));
            });
    };

    /**
     * @param {HTMLButtonElement} button 
     * @returns {Promise<void>}
     */
    const remove = async (button) => {
        if (!util.ask('Are you sure?')) {
            return;
        }

        const id = button.getAttribute('data-uuid');

        if (session.isAdmin()) {
            owns.set(id, button.getAttribute('data-own'));
        }

        changeActionButton(id, true);
        const btn = util.disableButton(button);
        const likes = like.getButtonLike(id);
        likes.disabled = true;

        const status = await request(HTTP_DELETE, '/api/comment/' + owns.get(id))
            .token(session.getToken())
            .send(dto.statusResponse)
            .then((res) => res.data.status);

        if (!status) {
            btn.restore();
            likes.disabled = false;
            changeActionButton(id, false);
            return;
        }

        document.querySelectorAll('a[onclick="undangan.comment.showOrHide(this)"]').forEach((n) => {
            const oldUuids = n.getAttribute('data-uuids').split(',');

            if (oldUuids.includes(id)) {
                const uuids = oldUuids.filter((i) => i !== id).join(',');
                uuids.length === 0 ? n.remove() : n.setAttribute('data-uuids', uuids);
            }
        });

        owns.unset(id);
        document.getElementById(id).remove();

        if (comments.children.length === 0) {
            comments.innerHTML = onNullComment();
        }
    };

    /**
     * @param {HTMLButtonElement} button 
     * @returns {Promise<void>}
     */
    const update = async (button) => {
        const id = button.getAttribute('data-uuid');

        let isPresent = false;
        const presence = document.getElementById(`form-inner-presence-${id}`);
        if (presence) {
            presence.disabled = true;
            isPresent = presence.value === '1';
        }

        const badge = document.getElementById(`badge-${id}`);
        const isChecklist = !!badge && badge.getAttribute('data-is-presence') === 'true';

        const gifIsOpen = gif.isOpen(id);
        const gifId = gif.getResultId(id);
        const gifCancel = gif.buttonCancel(id);

        if (gifIsOpen && gifId) {
            gifCancel.hide();
        }

        const form = document.getElementById(`form-inner-${id}`);

        if (id && !gifIsOpen && util.base64Encode(form.value) === form.getAttribute('data-original') && isChecklist === isPresent) {
            removeInnerForm(id);
            return;
        }

        if (!gifIsOpen && form.value?.trim().length === 0) {
            util.notify('Comments cannot be empty.').warning();
            return;
        }

        if (form) {
            form.disabled = true;
        }

        const cancel = document.querySelector(`[onclick="undangan.comment.cancel(this, '${id}')"]`);
        if (cancel) {
            cancel.disabled = true;
        }

        const btn = util.disableButton(button);

        const status = await request(HTTP_PUT, `/api/comment/${owns.get(id)}?lang=${lang.getLanguage()}`)
            .token(session.getToken())
            .body(dto.updateCommentRequest(presence ? isPresent : null, gifIsOpen ? null : form.value, gifId))
            .send(dto.statusResponse)
            .then((res) => res.data.status);

        if (form) {
            form.disabled = false;
        }

        if (cancel) {
            cancel.disabled = false;
        }

        if (presence) {
            presence.disabled = false;
        }

        btn.restore();

        if (gifIsOpen && gifId) {
            gifCancel.show();
        }

        if (!status) {
            return;
        }

        if (gifIsOpen && gifId) {
            document.getElementById(`img-gif-${id}`).src = document.getElementById(`gif-result-${id}`)?.querySelector('img').src;
            gifCancel.click();
        }

        removeInnerForm(id);

        if (!gifIsOpen) {
            const showButton = document.querySelector(`[onclick="undangan.comment.showMore(this, '${id}')"]`);

            const content = document.getElementById(`content-${id}`);
            content.setAttribute('data-comment', util.base64Encode(form.value));

            const original = util.convertMarkdownToHTML(util.escapeHtml(form.value));
            if (form.value.length > card.maxCommentLength) {
                util.safeInnerHTML(content, showButton?.getAttribute('data-show') === 'false' ? original.slice(0, card.maxCommentLength) + '...' : original);
                showButton?.classList.replace('d-none', 'd-block');
            } else {
                util.safeInnerHTML(content, original);
                showButton?.classList.replace('d-block', 'd-none');
            }
        }

        if (presence) {
            document.getElementById('form-presence').value = isPresent ? '1' : '2';
            storage('information').set('presence', isPresent);
        }

        if (!presence || !badge) {
            return;
        }

        badge.setAttribute('data-is-presence', isPresent ? 'true' : 'false');
        badge.textContent = isPresent ? 'Attending' : 'Cannot attend';
        badge.classList.toggle('text-success', isPresent);
        badge.classList.toggle('border-success-subtle', isPresent);
        badge.classList.toggle('text-secondary', !isPresent);
    };

    /**
     * @param {HTMLButtonElement} button 
     * @returns {Promise<void>}
     */
    const send = async (button) => {
        const id = button.getAttribute('data-uuid');

        const name = document.getElementById('form-name');
        const nameValue = name.value;

        if (nameValue.length === 0) {
            util.notify('Name cannot be empty.').warning();

            if (id) {
                // scroll to form.
                name.scrollIntoView({ block: 'center' });
            }
            return;
        }

        const presence = document.getElementById('form-presence');
        if (!id && presence && presence.value === '0') {
            util.notify('Please select your attendance status.').warning();
            return;
        }

        const gifIsOpen = gif.isOpen(id ? id : gif.default);
        const gifId = gif.getResultId(id ? id : gif.default);
        const gifCancel = gif.buttonCancel(id);

        if (gifIsOpen && !gifId) {
            util.notify('Gif cannot be empty.').warning();
            return;
        }

        if (gifIsOpen && gifId) {
            gifCancel.hide();
        }

        const form = document.getElementById(`form-${id ? `inner-${id}` : 'comment'}`);
        if (!gifIsOpen && form.value?.trim().length === 0) {
            util.notify('Comments cannot be empty.').warning();
            return;
        }

        if (!id && name && !session.isAdmin()) {
            name.disabled = true;
        }

        if (!session.isAdmin() && presence && presence.value !== '0') {
            presence.disabled = true;
        }

        if (form) {
            form.disabled = true;
        }

        const cancel = document.querySelector(`[onclick="undangan.comment.cancel(this, '${id}')"]`);
        if (cancel) {
            cancel.disabled = true;
        }

        const btn = util.disableButton(button);
        const isPresence = presence ? presence.value === '1' : true;

        if (!session.isAdmin()) {
            const info = storage('information');
            info.set('name', nameValue);

            if (!id) {
                info.set('presence', isPresence);
            }
        }

        const response = await request(HTTP_POST, `/api/comment?lang=${lang.getLanguage()}`)
            .token(session.getToken())
            .body(dto.postCommentRequest(id, nameValue, isPresence, gifIsOpen ? null : form.value, gifId))
            .send(dto.getCommentResponse);

        if (name) {
            name.disabled = false;
        }

        if (form) {
            form.disabled = false;
        }

        if (cancel) {
            cancel.disabled = false;
        }

        if (presence) {
            presence.disabled = false;
        }

        if (gifIsOpen && gifId) {
            gifCancel.show();
        }

        btn.restore();

        if (!response || response.code !== HTTP_STATUS_CREATED) {
            return;
        }

        owns.set(response.data.uuid, response.data.own);

        if (form) {
            form.value = null;
        }

        if (gifIsOpen && gifId) {
            gifCancel.click();
        }

        if (!id) {
            if (pagination.reset()) {
                await show();
                comments.scrollIntoView();
                return;
            }

            pagination.setTotal(pagination.geTotal() + 1);
            if (comments.children.length === pagination.getPer()) {
                comments.lastElementChild.remove();
            }

            response.data.is_parent = true;
            response.data.is_admin = session.isAdmin();
            comments.insertAdjacentHTML('afterbegin', await card.renderContentMany([response.data]));
            comments.scrollIntoView();
        }

        if (id) {
            showHide.set('hidden', showHide.get('hidden').concat([dto.commentShowMore(response.data.uuid, true)]));
            showHide.set('show', showHide.get('show').concat([id]));

            removeInnerForm(id);

            response.data.is_parent = false;
            response.data.is_admin = session.isAdmin();
            document.getElementById(`reply-content-${id}`).insertAdjacentHTML('beforeend', await card.renderContentSingle(response.data));

            const anchorTag = document.getElementById(`button-${id}`).querySelector('a');
            if (anchorTag) {
                if (anchorTag.getAttribute('data-show') === 'false') {
                    showOrHide(anchorTag);
                }

                anchorTag.remove();
            }

            const uuids = [response.data.uuid];
            const readMoreElement = document.createRange().createContextualFragment(card.renderReadMore(id, anchorTag ? anchorTag.getAttribute('data-uuids').split(',').concat(uuids) : uuids));

            const buttonLike = like.getButtonLike(id);
            buttonLike.parentNode.insertBefore(readMoreElement, buttonLike);
        }

        like.addListener(response.data.uuid);
        lastRender.push(response.data.uuid);
    };

    /**
     * @param {HTMLButtonElement} button
     * @param {string} id
     * @returns {Promise<void>}
     */
    const cancel = async (button, id) => {
        const presence = document.getElementById(`form-inner-presence-${id}`);
        const isPresent = presence ? presence.value === '1' : false;

        const badge = document.getElementById(`badge-${id}`);
        const isChecklist = badge && owns.has(id) && presence ? badge.getAttribute('data-is-presence') === 'true' : false;

        const btn = util.disableButton(button);

        if (gif.isOpen(id) && ((!gif.getResultId(id) && isChecklist === isPresent) || util.ask('Are you sure?'))) {
            await gif.remove(id);
            removeInnerForm(id);
            return;
        }

        const form = document.getElementById(`form-inner-${id}`);
        if (form.value.length === 0 || (util.base64Encode(form.value) === form.getAttribute('data-original') && isChecklist === isPresent) || util.ask('Are you sure?')) {
            removeInnerForm(id);
            return;
        }

        btn.restore();
    };

    /**
     * @param {string} uuid 
     * @returns {void}
     */
    const reply = (uuid) => {
        changeActionButton(uuid, true);

        gif.remove(uuid).then(() => {
            gif.onOpen(uuid, () => gif.removeGifSearch(uuid));
            document.getElementById(`button-${uuid}`).insertAdjacentElement('afterend', card.renderReply(uuid));
        });
    };

    /**
     * @param {HTMLButtonElement} button 
     * @param {boolean} is_parent
     * @returns {Promise<void>}
     */
    const edit = async (button, is_parent) => {
        const id = button.getAttribute('data-uuid');

        changeActionButton(id, true);

        if (session.isAdmin()) {
            owns.set(id, button.getAttribute('data-own'));
        }

        const badge = document.getElementById(`badge-${id}`);
        const isChecklist = !!badge && badge.getAttribute('data-is-presence') === 'true';

        const gifImage = document.getElementById(`img-gif-${id}`);
        if (gifImage) {
            await gif.remove(id);
        }

        const isParent = is_parent && !session.isAdmin();
        document.getElementById(`button-${id}`).insertAdjacentElement('afterend', card.renderEdit(id, isChecklist, isParent, !!gifImage));

        if (gifImage) {
            gif.onOpen(id, () => {
                gif.removeGifSearch(id);
                gif.removeButtonBack(id);
            });

            await gif.open(id);
            return;
        }

        const formInner = document.getElementById(`form-inner-${id}`);
        const original = util.base64Decode(document.getElementById(`content-${id}`)?.getAttribute('data-comment'));

        formInner.value = original;
        formInner.setAttribute('data-original', util.base64Encode(original));
    };

    /**
     * @returns {void}
     */
    const init = () => {
        gif.init();
        like.init();
        card.init();
        pagination.init();

        comments = document.getElementById('comments');
        comments.addEventListener('undangan.comment.show', show);

        owns = storage('owns');
        showHide = storage('comment');

        if (!showHide.has('hidden')) {
            showHide.set('hidden', []);
        }

        if (!showHide.has('show')) {
            showHide.set('show', []);
        }
    };

    return {
        gif,
        like,
        pagination,
        init,
        send,
        edit,
        reply,
        remove,
        update,
        cancel,
        show,
        showMore,
        showOrHide,
    };
})();
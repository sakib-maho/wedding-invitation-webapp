import { gif } from './gif.js';
import { util } from '../../common/util.js';
import { storage } from '../../common/storage.js';
import { session } from '../../common/session.js';

export const card = (() => {

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let owns = null;

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let likes = null;

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let config = null;

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let showHide = null;

    const maxCommentLength = 300;

    /**
     * @returns {string}
     */
    const renderLoading = () => {
        return `
        <div class="bg-theme-auto shadow p-3 mx-0 mt-0 mb-3 rounded-4 skeleton-card" role="status" aria-label="Loading comment">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="skeleton skeleton-title" style="width: 40%;"></div>
                <div class="skeleton skeleton-text" style="width: 25%;"></div>
            </div>
            <div class="skeleton skeleton-text" style="width: 100%;"></div>
            <div class="skeleton skeleton-text" style="width: 85%; margin-top: 0.5rem;"></div>
            <div class="skeleton skeleton-text" style="width: 70%; margin-top: 0.5rem;"></div>
            <div class="d-flex justify-content-between align-items-center mt-3">
                <div class="skeleton skeleton-text" style="width: 30%;"></div>
                <div class="skeleton skeleton-text" style="width: 20%;"></div>
            </div>
        </div>`;
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} c
     * @returns {string}
     */
    const renderLike = (c) => {
        const likeCount = c.like_count || 0;
        const hasLikes = likeCount > 0;
        const isLiked = likes.has(c.uuid);
        
        // Show golden heart if comment has at least one like OR if current user has liked it
        const showGoldenHeart = hasLikes || isLiked;
        
        return `
        <button style="font-size: 0.8rem;" onclick="undangan.comment.like.love(this)" data-uuid="${c.uuid}" class="btn btn-sm btn-outline-auto ms-auto rounded-3 p-0 shadow-sm d-flex justify-content-start align-items-center" data-offline-disabled="false">
            <span class="my-0 mx-1" data-count-like="${likeCount}">${likeCount}</span>
            <i class="me-1 ${showGoldenHeart ? 'fa-solid fa-heart text-golden' : 'fa-regular fa-heart'}"></i>
        </button>`;
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} c
     * @returns {string}
     */
    const renderAction = (c) => {
        let action = `<div class="d-flex justify-content-start align-items-center" data-button-action="${c.uuid}">`;

        if (config.get('can_reply') !== false) {
            action += `<button style="font-size: 0.8rem;" onclick="undangan.comment.reply('${c.uuid}')" class="btn btn-sm btn-outline-auto rounded-4 py-0 me-1 shadow-sm" data-offline-disabled="false">Reply</button>`;
        }

        if (session.isAdmin() && c.is_admin && (!c.gif_url || gif.isActive())) {
            action += `<button style="font-size: 0.8rem;" onclick="undangan.comment.edit(this, ${c.is_parent ? 'true' : 'false'})" data-uuid="${c.uuid}" class="btn btn-sm btn-outline-auto rounded-4 py-0 me-1 shadow-sm" data-own="${c.own}" data-offline-disabled="false">Edit</button>`;
        } else if (owns.has(c.uuid) && config.get('can_edit') !== false && (!c.gif_url || gif.isActive())) {
            action += `<button style="font-size: 0.8rem;" onclick="undangan.comment.edit(this, ${c.is_parent ? 'true' : 'false'})" data-uuid="${c.uuid}" class="btn btn-sm btn-outline-auto rounded-4 py-0 me-1 shadow-sm" data-offline-disabled="false">Edit</button>`;
        }

        if (session.isAdmin()) {
            action += `<button style="font-size: 0.8rem;" onclick="undangan.comment.remove(this)" data-uuid="${c.uuid}" class="btn btn-sm btn-outline-auto rounded-4 py-0 me-1 shadow-sm" data-own="${c.own}" data-offline-disabled="false">Delete</button>`;
        } else if (owns.has(c.uuid) && config.get('can_delete') !== false) {
            action += `<button style="font-size: 0.8rem;" onclick="undangan.comment.remove(this)" data-uuid="${c.uuid}" class="btn btn-sm btn-outline-auto rounded-4 py-0 me-1 shadow-sm" data-offline-disabled="false">Delete</button>`;
        }

        action += '</div>';

        return action;
    };

    /**
     * @param {string} uuid
     * @param {string[]} uuids
     * @returns {string}
     */
    const renderReadMore = (uuid, uuids) => {
        uuid = util.escapeHtml(uuid);

        const hasId = showHide.get('show').includes(uuid);
        return `<a class="text-theme-auto" style="font-size: 0.8rem;" onclick="undangan.comment.showOrHide(this)" data-uuid="${uuid}" data-uuids="${util.escapeHtml(uuids.join(','))}" data-show="${hasId ? 'true' : 'false'}" role="button" class="me-auto ms-1 py-0">${hasId ? 'Hide replies' : `Show replies (${uuids.length})`}</a>`;
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} c
     * @returns {string}
     */
    const renderButton = (c) => {
        return `
        <div class="d-flex justify-content-between align-items-center" id="button-${c.uuid}">
            ${renderAction(c)}
            ${c.comments.length > 0 ? renderReadMore(c.uuid, c.comments.map((i) => i.uuid)) : ''}
            ${renderLike(c)}
        </div>`;
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} c
     * @returns {string}
     */
    const renderTracker = (c) => {
        // Hide IP and user agent information from all users
            return '';
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} c
     * @returns {string}
     */
    const renderHeader = (c) => {
        if (c.is_parent) {
            return `class="bg-theme-auto shadow p-3 mx-0 mt-0 mb-3 rounded-4"`;
        }

        return `class="${!showHide.get('hidden').find((i) => i.uuid === c.uuid)['show'] ? 'd-none' : ''} overflow-x-auto mw-100 border-start bg-theme-auto py-2 ps-2 pe-0 my-2 ms-2 me-0"`;
    };

    /**
     * @param {string} value
     * @returns {string}
     */
    const formatCommentDate = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return util.escapeHtml(String(value ?? ''));
        }

        return util.escapeHtml(new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Tokyo',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).format(date));
    };

    /**
     * @param {boolean} attending
     * @param {string} id
     * @returns {string}
     */
    const renderPresence = (attending, id) => {
        const label = attending ? 'Attending' : 'Cannot attend';
        const tone = attending ? 'text-success border border-success-subtle' : 'text-secondary border';
        return `<span id="badge-${id}" data-is-presence="${attending ? 'true' : 'false'}" class="badge rounded-pill fw-normal ms-1 ${tone}">${label}</span>`;
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} c
     * @returns {string}
     */
    const renderTitle = (c) => {
        if (c.is_admin) {
            return `<strong class="me-1">${util.escapeHtml(c.name)}</strong><i class="fa-solid fa-certificate text-primary"></i>`;
        }

        if (c.is_parent) {
            return `<strong class="me-1">${util.escapeHtml(c.name)}</strong>${renderPresence(!!c.presence, c.uuid)}`;
        }

        return `<strong>${util.escapeHtml(c.name)}</strong>`;
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} c
     * @returns {Promise<string>}
     */
    const renderBody = async (c) => {
        const head = `
        <div class="d-flex justify-content-between align-items-start gap-2">
            <p class="text-theme-auto m-0 p-0" style="font-size: 0.95rem;">${renderTitle(c)}</p>
            <small class="text-theme-auto m-0 p-0 text-nowrap" style="font-size: 0.75rem;">${formatCommentDate(c.created_at)}</small>
        </div>
        <hr class="my-1">`;

        if (c.gif_url) {
            return head + `
            <div class="d-flex justify-content-center align-items-center my-2">
                <img src="${await gif.get(c.gif_url)}" id="img-gif-${c.uuid}" class="img-fluid mx-auto gif-image rounded-4" alt="selected-gif">
            </div>`;
        }

        const moreMaxLength = c.comment.length > maxCommentLength;
        const data = util.convertMarkdownToHTML(util.escapeHtml(moreMaxLength ? (c.comment.slice(0, maxCommentLength) + '...') : c.comment));

        return head + `
        <p dir="auto" class="text-theme-auto my-1 mx-0 p-0" style="white-space: pre-wrap !important; font-size: 0.95rem;" data-comment="${util.base64Encode(c.comment)}" id="content-${c.uuid}">${data}</p>
        ${moreMaxLength ? `<p class="d-block mb-2 mt-0 mx-0 p-0"><a class="text-theme-auto" role="button" style="font-size: 0.85rem;" data-show="false" onclick="undangan.comment.showMore(this, '${c.uuid}')">Read more</a></p>` : ''}`;
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} c
     * @returns {Promise<string>}
     */
    const renderContent = async (c) => {
        const body = await renderBody(c);
        const resData = await Promise.all(c.comments.map((cmt) => renderContent(cmt)));

        return `
        <div ${renderHeader(c)} id="${c.uuid}" style="overflow-wrap: break-word !important;">
            <div id="body-content-${c.uuid}" data-tapTime="0" data-liked="false" tabindex="0">${body}</div>
            ${renderTracker(c)}
            ${renderButton(c)}
            <div id="reply-content-${c.uuid}">${resData.join('')}</div>
        </div>`;
    };

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>[]} cs
     * @returns {Promise<string>}
     */
    const renderContentMany = (cs) => Promise.all(cs.map((i) => renderContent(i))).then((r) => r.join(''));

    /**
     * @param {ReturnType<typeof dto.getCommentResponse>} cs
     * @returns {Promise<string>}
     */
    const renderContentSingle = (cs) => renderContent(cs);

    /**
     * @param {string} id 
     * @returns {HTMLDivElement}
     */
    const renderReply = (id) => {
        id = util.escapeHtml(id);

        const inner = document.createElement('div');
        inner.classList.add('my-2');
        inner.id = `inner-${id}`;
        const template = `
        <p class="my-1 mx-0 p-0" style="font-size: 0.95rem;"><i class="fa-solid fa-reply me-2"></i>Reply</p>
        <div class="d-block mb-2" id="comment-form-${id}">
            <div class="position-relative">
                ${!gif.isActive() ? '' : `<button class="btn btn-secondary btn-sm rounded-4 shadow-sm me-1 my-1 position-absolute bottom-0 end-0" onclick="undangan.comment.gif.open('${id}')" aria-label="button gif" data-offline-disabled="false"><i class="fa-solid fa-photo-film"></i></button>`}
                <textarea dir="auto" class="form-control shadow-sm rounded-4 mb-2" id="form-inner-${id}" minlength="1" maxlength="1000" placeholder="Type reply comment" rows="3" data-offline-disabled="false"></textarea>
            </div>
        </div>
        <div class="d-none mb-2" id="gif-form-${id}"></div>
        <div class="d-flex justify-content-end align-items-center mb-0">
            <button style="font-size: 0.8rem;" onclick="undangan.comment.cancel(this, '${id}')" class="btn btn-sm btn-outline-auto rounded-4 py-0 me-1" data-offline-disabled="false">Cancel</button>
            <button style="font-size: 0.8rem;" onclick="undangan.comment.send(this)" data-uuid="${id}" class="btn btn-sm btn-outline-auto rounded-4 py-0" data-offline-disabled="false">Send</button>
        </div>`;

        return util.safeInnerHTML(inner, template);
    };

    /**
     * @param {string} id 
     * @param {boolean} presence 
     * @param {boolean} is_parent 
     * @param {boolean} is_gif 
     * @returns {HTMLDivElement}
     */
    const renderEdit = (id, presence, is_parent, is_gif) => {
        id = util.escapeHtml(id);

        const inner = document.createElement('div');
        inner.classList.add('my-2');
        inner.id = `inner-${id}`;
        const template = `
        <p class="my-1 mx-0 p-0" style="font-size: 0.95rem;"><i class="fa-solid fa-pen me-2"></i>Edit</p>
        ${!is_parent ? '' : `
        <select class="form-select shadow-sm mb-2 rounded-4" id="form-inner-presence-${id}" data-offline-disabled="false">
            <option value="1" ${presence ? 'selected' : ''}>Attending</option>
            <option value="2" ${presence ? '' : 'selected'}>Cannot attend</option>
        </select>`}
        ${!is_gif ? `<textarea dir="auto" class="form-control shadow-sm rounded-4 mb-2" id="form-inner-${id}" minlength="1" maxlength="1000" placeholder="Type update comment" rows="3" data-offline-disabled="false"></textarea>    
        ` : `${!gif.isActive() ? '' : `<div class="d-none mb-2" id="gif-form-${id}"></div>`}`}
        <div class="d-flex justify-content-end align-items-center mb-0">
            <button style="font-size: 0.8rem;" onclick="undangan.comment.cancel(this, '${id}')" class="btn btn-sm btn-outline-auto rounded-4 py-0 me-1" data-offline-disabled="false">Cancel</button>
            <button style="font-size: 0.8rem;" onclick="undangan.comment.update(this)" data-uuid="${id}" class="btn btn-sm btn-outline-auto rounded-4 py-0" data-offline-disabled="false">Update</button>
        </div>`;

        return util.safeInnerHTML(inner, template);
    };

    /**
     * @returns {void}
     */
    const init = () => {
        owns = storage('owns');
        likes = storage('likes');
        config = storage('config');
        showHide = storage('comment');
    };

    return {
        init,
        renderEdit,
        renderReply,
        renderLoading,
        renderReadMore,
        renderContentMany,
        renderContentSingle,
        maxCommentLength,
    };
})();
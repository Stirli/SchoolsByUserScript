// ==UserScript==
// @name         copy/paste quarter marks in class journal
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Data format: one column with '\r\n' delimeter
// @author       Stirli
// @match        https://*.schools.by/journal/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=schools.by 
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    $.noConflict();
    jQuery(document).ready(function ($) {
        Array.prototype.dic = function (arr2) {
            if (!Array.isArray(arr2)) {
                throw new Error("arr2 is not Array");
            }
    
            if (this.length != arr2.length) {
                throw new Error("arr2 must be same length");
            }
    
            let dic = [];
            for (let i = 0; i < this.length; i++) {
                dic[this[i]] = arr2[i];
            }
    
            return dic;
        }
    
        const marksEx1 = ["з.", "н/а", "осв."];
        const marksEx2 = ["ЗЧ", "НУ", "ОСВ"];
    
        const setDic = marksEx2.dic([-2, -4, -5]);
        const getDic = marksEx1.dic(marksEx2);
    
        function createButtonPanel() {
            const pn = $('<div><p>Четвертные оценки:</p></div>');
            const ul = $('<ul></ul>').appendTo(pn);
            pn.addButton = (text, onClick) => {
                $(`<li style='display: inline; margin: 8px;'><a style='cursor:pointer'>${text}</a></li>`)
                    .click(onClick)
                    .appendTo(ul);
                return pn;
            };
    
            return pn;
        }
    
        function onElementAdded(selector, callback) {
            const observer = new MutationObserver((mutationsList) => {
                for (let mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        for (let node of mutation.addedNodes) {
                            if (node.matches && node.matches(selector)) {
                                callback(node);
                            }
                        }
                    }
                }
            });
    
            observer.observe(document.body, { childList: true, subtree: true });
        }
    
        async function postQuarterMarkAsync(id, m, quarter_id, pupil_id) {
            return new Promise(resolve => {
                const subj = window.location.href.match(/journal\/(\d+)(#\d+)?$/)[1];
                if (subj === undefined) {
                    alert("Не удалось определить предмет");
                    return;
                }
                $.post({
                    url: `https://138minsk.schools.by/marks/class-subject:${subj}/set-quarter`,
                    data: { id, m, quarter_id, pupil_id }
                })
                    .done(function (res) {
                        resolve(res);
                    });
            });
        }
    
        async function onCopyClick(params) {
            const arr = $('tbody td.qmark span')
                .map((i, e) => getDic[e.innerText] ?? parseInt(e.innerText))
                .toArray();
            await navigator.clipboard.writeText(arr.join('\r\n'));
        }
    
        async function onPasteClick() {
            const text = await navigator.clipboard.readText();
            if (text === undefined) {
                console.log('clipboard error');
                alert('clipboard error');
                return;
            }
            const arr = text.trim()
                .split(/\r\n|\r|\n/g)
                .map((e) => setDic[e] ?? parseInt(e));
            console.log(arr);
    
            if (arr.length < 1) {
                console.log('WAT??');
                return;
            }
    
            let posts = $('tbody td.qmark')
                .map(function (i, e) {
                    let pupil_id = $(this).parent().attr('pupil_id');
                    let m = arr[i];
                    if (m === undefined) {
                        console.log('no mark for ', e)
                    }
    
                    return postQuarterMarkAsync(
                        $(this).attr('m_id') ?? null,
                        m,
                        $(this).attr('quarter_id'),
                        pupil_id);
                })
                .toArray();
    
            await Promise.all(posts);
            window.location.reload();
        }
    
        onElementAdded('.j_above', (element) => {
            createButtonPanel()
                .addButton("Копировать", onCopyClick)
                .addButton("Вставить", onPasteClick)
                .prependTo('.j_above_line');
        });
    });    
})();

// ==UserScript==
// @name         copy/paste quarter marks in class journal
// @namespace    http://tampermonkey.net/
// @version      1.2
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

        const emptyPromise = new Promise(resolve => resolve());

        const specMarks = ["н", "з.", "н/а", "осв."];
        const asodSpecMarks = ["ЗЧ", "НУ", "ОСВ"];
        const specToNumDic = specMarks.dic([-1, -2, -4, -5]);

        const specToAsodDic = specMarks.dic(["", ...asodSpecMarks]);
        const asodToNum = asodSpecMarks.dic([-2, -4, -5]);

        class ButtonPanel {
            #panel;
            #ul;

            constructor({ parentSelector, caption }) {
                this.#panel = $('<div><p>' + caption + ':</p></div>')
                    .appendTo(parentSelector);
                this.#ul = $('<ul></ul>')
                    .appendTo(this.#panel);
            }

            get jQuery() {
                return this.#panel;
            }

            addButton(text, onClick) {
                $(`<li style='display: inline; margin: 8px;'><a style='cursor:pointer'>${text}</a></li>`)
                    .click(onClick)
                    .appendTo(this.#ul);
            }
        }

        class CopyPasteButtonPanel extends ButtonPanel {

            #markSelector;

            constructor(options) {
                super(options);
            }


            async _postSubjectDataAsync({ method, data }) {
                return new Promise(resolve => {
                    const subj = window.location.href.match(/journal\/(\d+)(#\d+)?$/)[1];
                    if (subj === undefined) {
                        alert("Не удалось определить предмет");
                        return;
                    }
                    $.post({
                        url: `https://${window.location.host}/marks/class-subject:${subj}/${method}`,
                        data
                    })
                        .done(function (res) {
                            resolve(res);
                        });
                });
            }

            async _readClipboardData() {
                const text = await navigator.clipboard.readText();
                if (text === undefined) {
                    console.log('clipboard error');
                    alert('clipboard error');
                    return;
                }
                const arr = text
                    .split(/\r\n|\r|\n/g)
                    .map(line => line.split('\t'));
                console.log(arr);

                if (arr.length < 1) {
                    console.log('WAT??');
                }

                return arr;
            }
        }

        class AllMarksPanel extends CopyPasteButtonPanel {
            constructor({ parentSelector }) {
                super({ parentSelector, caption: "Все оценки" });
                this.addButton("Копировать", this.#onCopyClick.bind(this))
                this.addButton("Вставить", this.#onPasteClick.bind(this))
            }

            async #onCopyClick() {
                const arr = $('table.mtable tbody tr')
                    .map((i, e) => $(e)
                        .find('td.mark, td.dis')
                        .map((i, e) => e.innerText.trim())
                        .toArray()
                        .join('\t'))
                    .toArray()
                    .join('\r\n');
                await navigator.clipboard.writeText(arr);
                alert('Скопировано');
            }

            async #onPasteClick() {

                const arr = await this._readClipboardData();

                console.log(arr);
                const lessons = $('table.mtable tr.lesson_dates td.lesson_date').map((i, e) => ({
                    lesson_date: $(e).attr('day'),
                    lesson_id: $(e).attr('lesson_id')
                }));
                const tasks = $('table.mtable tbody tr')
                    .map((pId, e) => {
                        let pupil_id = $(e).attr('pupil_id');
                        return $(e).find('td.mark, td.dis')
                            .map((lesId, e) => {
                                let m = arr[pId][lesId];
                                if (m === undefined || e.innerText.trim() === m) {
                                    console.log('no mark for ', e);
                                    return emptyPromise;
                                }

                                return this._postSubjectDataAsync({
                                    method: 'set',
                                    data: {
                                        id: $(e).attr('m_id') ?? null,
                                        m: specToNumDic[m] ?? m,
                                        pupil_id,
                                        ...lessons[lesId]
                                    }
                                })
                            });
                    });
                await Promise.all(tasks);
                window.location.reload();
            }
        }

        class QuarterPanel extends CopyPasteButtonPanel {

            constructor({ parentSelector }) {
                super({ parentSelector, caption: "Четвертные оценки" });
                this.addButton("Копировать", this.#onCopyClick.bind(this))
                this.addButton("Копировать в АСОД", this.#onCopyToAsodClick.bind(this))
                this.addButton("Вставить", this.#onPasteClick.bind(this))
                this.addButton("Вставить из АСОД", this.#onPasteFromASODClick.bind(this))
            }


            async #onCopyClick() {
                const arr = $('tbody td.qmark span')
                    .map((i, e) => e.innerText)
                    .toArray();
                await navigator.clipboard.writeText(arr.join('\r\n'));
                alert('Скопировано');
            }

            async #onCopyToAsodClick() {
                const arr = $('tbody td.qmark span')
                    .map((i, e) => specToAsodDic[e.innerText] ?? e.innerText)
                    .toArray();
                await navigator.clipboard.writeText(arr.join('\r\n'));
                alert('Скопировано');
            }

            async #onPasteClick() {
                const arr = (await this._readClipboardData()).map(a => a[0]);
                console.log(arr);

                let posts = $('tbody td.qmark')
                    .map((i, e) => {
                        let pupil_id = $(e).parent().attr('pupil_id');
                        let m = arr[i];
                        if (m === undefined || e.innerText.trim() === m) {
                            console.log('no mark for ', e)
                        }

                        return this._postSubjectDataAsync({
                            method: 'set-quarter',
                            data: {
                                id: $(e).attr('m_id') ?? null,
                                m: specToNumDic[m] ?? m,
                                quarter_id: $(e).attr('quarter_id'),
                                pupil_id
                            }
                        })
                    })
                    .toArray();

                await Promise.all(posts);
                window.location.reload();
            }

            async #onPasteFromASODClick() {
                const arr = (await this._readClipboardData()).map(a => a[0]);
                console.log(arr);

                let posts = $('tbody td.qmark')
                    .map((i, e) => {
                        let pupil_id = $(e).parent().attr('pupil_id');
                        let m = arr[i];
                        if (m === undefined || e.innerText.trim() === m) {
                            console.log('no mark for ', e)
                        }

                        return this._postSubjectDataAsync({
                            method: 'set-quarter',
                            data: {
                                id: $(e).attr('m_id') ?? null,
                                m: asodToNum[m] ?? m,
                                quarter_id: $(e).attr('quarter_id'),
                                pupil_id
                            }
                        })
                    })
                    .toArray();

                await Promise.all(posts);
                window.location.reload();
            }

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

        onElementAdded('.j_above', (element) => {
            new AllMarksPanel({ parentSelector: ".j_above_line" });
            new QuarterPanel({ parentSelector: ".j_above_line" });
        });
    });
})();

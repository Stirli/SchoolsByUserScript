// ==UserScript==
// @name         CopyPasteClass
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description
// @author       You
// @match        https://*.schools.by/class/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=schools.by
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery-scrollTo/2.1.3/jquery.scrollTo.min.js
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    Array.prototype.dic = function (arr2) {
        if (!Array.isArray(arr2)) {
            throw new Error("arr2 is not Array");
        }

        if (this.length != arr2.length) {
            throw new Error("arr2 must be same length");
        }

        let dic = new Map();
        for (let i = 0; i < this.length; i++) {
            dic[this[i]] = arr2[i];
        }

        return dic;
    }

    const marksEx1 = ["з.", "н/а", "осв.", ''];
    const marksEx2 = ["ЗЧ", "НУ", "ОСВ", "НИ"];

    const setDic = marksEx2.dic([-2, -4, -5, null]);
    const getDic = marksEx1.dic(marksEx2);

    const subjects = [
        ['Белорусский язык', 1],
        ['Белорусская литература', 2],
        ['Русский язык', 3],
        ['Русская литература', 4],
        ['Английский язык', 5],
        ['Математика', 6],
        ['Информатика', 7],
        ['История Беларуси', 8],
        ['Великая Отечественная война (IX класс)', 8],
        ['Всемирная История', 9],
        ['Человек и Мир', 10],
        ['Обществоведение', 11],
        ['География', 12],
        ['Биология', 13],
        ['Физика', 14],
        ['Астрономия', 15],
        ['Химия', 16],
        ['Физическая культура и здоровье', 17],
        ['Трудовое обучение', 18],
        ['Допризывная и медицинская подготовка', 19],
        ['Черчение', 20],
        ['История Беларуси в контексте всемирной истории', 21]
    ]
        .reduce((dic, val) => {
            dic[val[0]] = val[1];
            return dic;
        }, new Map());

    function initEmptyUI() {
        $("#subj_quart_copy_wrap").empty();

        const copySelectedBtn = $("<div class='btn'>Копировать выбранное</div>")
            .click(onCopySelectedBtnClick);
        const selectAllBtn = $("<div class='btn'>Выбрать всё</div>")
            .click(function () {
                $('#subjList input').prop('checked', true);
            });
        const cancelAllBtn = $("<div class='btn'>Отменить всё</div>")
            .click(function () {
                $('#subjList input').prop('checked', false);
            });

        const pluginUiBody = $(`
                <div id='subj_quart_copy_wrap' class='line_small'>
                    <p>Нажмите на предмет, чтобы добавить его в список.
                    <br>Удерживайте при этом Ctrl, чтобы сразу скопировать его в буфер обмена</p>
                </div>`)
            .append(selectAllBtn)
            .append(cancelAllBtn)
            .append(copySelectedBtn)
            .append('<ol id="subjList"/>');
        $('.grid_pst').after(pluginUiBody);
    }

    async function getSubjectQuartersAsync({ subject_id }) {
        let url = window.location.origin + '/journal/' + subject_id;
        return new Promise((resolve) => {
            jQuery.ajax({
                url,
                type: 'get',
                dataType: 'html',
                success: function (data) {
                    const arr = $(data)
                        .find('#journal_quarters_menu ul')
                        .map((i, ul) => {
                            const title = $(ul).find('.indorsement').text().trim();
                            const quarters = $(ul).find('.past, .current')
                                .map((i, past) => ({
                                    id: past.getAttribute('quarter_id'),
                                    title: past.innerText.trim(),
                                    selected: past.className === 'current' ? 'selected' : ''
                                }))
                                .toArray();
                            return ({ title, quarters });
                        })
                        .toArray();
                    resolve(arr);
                }
            });
        });
    }

    async function fillSubjectsListAsync() {
        const class_id = window.location.href.match(/class\/(\d+)/)[1];
        const lessons = await getClassLessonsAsync(class_id);
        lessons.sort((e1, e2) => e1.i - e2.i);
        lessons.forEach(function ({ id, name }) {
            $(`<li data-subject="${id}"><input id="subj${id}Check" type="checkbox" checked><label for="subj${id}Check">${name}</label></li>`)
                .click(onSelectSubjectLinkClick)
                .appendTo($("#subjList"));
        });
        if (lessons.length > 0) {
            const quartersByYears = await getSubjectQuartersAsync({ subject_id: lessons[0].id });
            const quartersSelectorHtml = quartersByYears
                .map(({ title, quarters }) => quarters
                    .map(({ title: qtitle, id, selected }) => `<option ${selected} value="${id}">${title} - ${qtitle}</option>`))
                .flat()
                .join('\r\n');
            $("#subjList").before('<select id="quarterSelector">' + quartersSelectorHtml + '</select>');
        }
    }


    async function getClassStudentsAsync(class_id) {
        return new Promise(resolve => {
            jQuery.ajax({
                url: `https://${window.location.host}/class/${class_id}/pupils`,
                type: 'get',
                dataType: 'html',
                success: function (data) {
                    resolve($(data)
                        .find('.pupil a.user_type_1')
                        .map((i, e) => ({ num: i + 1, name: e.innerText, id: e.getAttribute('href').match(/\d+/)[0] }))
                        .toArray()
                    );
                }
            })
        });
    }
    async function getClassLessonsAsync(class_id) {
        return new Promise(resolve => {
            jQuery.ajax({
                url: `https://${window.location.host}/class/${class_id}/lessons`,
                type: 'get',
                dataType: 'html',
                success: function (data) {
                    const arr = $(data)
                        .find(".sbp a")
                        .map((i, e) => ({ i: subjects[e.innerText.trim()], id: e.href.match(/lessons\/(\d+)/)[1], name: e.innerText.trim() }))
                        .toArray()
                        .filter(e => e.i);
                    resolve(arr);
                }
            });
        });
    }

    async function getQuarterMarksAsync({ subject_id, quarter_id, subject_order }) {
        let url = window.location.origin + '/journal/' + subject_id + '/quarter/' + quarter_id;

        return new Promise((resolve) => {
            jQuery.ajax({
                url,
                type: 'get',
                dataType: 'html',
                success: function (data) {
                    const arr = $(data)
                        .find('tbody .qmark span')
                        .map((i, e) => {
                            const mark = e.innerText.trim();
                            return getDic[mark] ?? mark;
                        })
                        .toArray();
                    resolve({ index: subject_order ?? 0, arr });
                }
            });
        });
    }

    async function onSelectSubjectLinkClick(event) {
        if (event.ctrlKey) {
            const { _, arr } = await getQuarterMarksAsync({ subject_id: this.getAttribute('data-subject') });
            focus();
            await navigator.clipboard.writeText(arr.join("\r\n"));
            alert('Скопировано');
            event.preventDefault();
            return;
        }
    }

    async function onQuarterMarksButtonClick() {
        initEmptyUI();
        await fillSubjectsListAsync();
    }

    async function onCopySelectedBtnClick() {
        const quarter_id = $('#quarterSelector').val();
        const class_id = window.location.href.match(/class\/(\d+)/)[1];

        const tasks = $('#subjList input:checked')
            .parent()
            .map((i, e) => getQuarterMarksAsync({ subject_id: e.getAttribute('data-subject'), subject_order: i, quarter_id }))
            .toArray();
        const tableArr = (await Promise.all(tasks)).sort((a, b) => a.index - b.index);
        let textBuf = '';

        const students = await getClassStudentsAsync(class_id);

        const table = $(`<table id="tbl_quart_${quarter_id}" class='table'/>`)
            .appendTo("#subj_quart_copy_wrap");

        const headTrString = $('#subjList input:checked + label')
            .toArray()
            .map(label => `<th>${label.innerText}</th>`)
            .join('');

        $('<tr/>')
            .appendTo(table)
            .wrap('<thead/>')
            .append('<th>№</th><th>Ф.И.О.</th>')
            .append(headTrString);

        const tbody = $('<tbody/>')
            .appendTo(table);
        const marksCount = tableArr[0].arr.length;
        for (let i = 0; i < marksCount; i++) {
            const lineArr = tableArr.map(v => v.arr[i]);
            tbody.append(`<tr><th>${students[i].num}</th><th>${students[i].name}</th>${lineArr.map(el => `<td>${el}</td>`).join()}</tr>`);
            textBuf += lineArr.join('\t') + '\r\n';
        }

        await navigator.clipboard.writeText(textBuf);
        alert('скопировано');
        $('body').scrollTo(table,1000, {margin:true});
    }

    jQuery(document).ready(function ($) {
        $('.title_box h1').click(() => {
            navigator.clipboard.writeText($('.pupil').map((i, e) => `=ПОИСК("${e.innerText.trim()}";$B${6 + i})=1`).toArray().join("\n"))
        });

        GM_addStyle(
            `   .table {
                    display: block;
                    overflow-x: auto;
                    width: 100%;
                    margin-bottom: 20px;
                    border: 1px solid #dddddd;
                    border-collapse: collapse; 
                }
                .table tbody {
                    width: 100%;
                }
                .table th {
                    font-weight: bold;
                    padding: 5px;
                    background: #efefef;
                    border: 1px solid #dddddd;
                }
                .table td {
                    border: 1px solid #dddddd;
                    padding: 5px;
                }
                #subj_quart_copy_wrap li {
                    padding:4px; 
                    list-style: auto;
                }

                #subj_quart_copy_wrap ul, #subj_quart_copy_wrap ol {
                    padding: revert;
                    margin-bottom: 32px;
                }
                .lnk{
                    margin: 4px;
                    cursor:pointer; 
                }
                .btn {
                    cursor:default;
                    padding: 4px;
                    margin: 4px;
                    background-color: #F3F5FF;
                    width: fit-content;
                    border: 1px solid #E2E7FF;
                    border-radius: 4px;
                }`);

        $('.tabs1_wrap')
            .before($('<div class="btn">Четвертные оценки</div>')
                .click(onQuarterMarksButtonClick));
    });
})();

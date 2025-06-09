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

        const loadSelectedBtn = $("<div class='btn'>Загрузить выбранное</div>")
            .click(onLoadSelectedBtnClick);
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
            .append(loadSelectedBtn)
            .append('<ol id="subjList"/>');
        $('.grid_pst').after(pluginUiBody);
    }


    async function getSubjectMarksAsync({ subject_id }) {
        let url = window.location.origin + '/journal/' + subject_id;
        return new Promise((resolve) => {
            jQuery.ajax({
                url,
                type: 'get',
                dataType: 'html',
                success: function (data) {
                    const url = $(data)
                        .find('#journal_quarters_menu ul')
                        .last()
                        .find(".quarters")
                        .attr('src');

                    jQuery.ajax({
                        url,
                        type: 'get',
                        dataType: 'html',
                        success: function (data) {
                            const pupils = [];
                            const marks = [];
                            $(data)
                                .find('.ltable tbody tr')
                                .each((i, tr) => {
                                    const id = parseInt(tr.getAttribute('pupil_id'));
                                    const name = $(tr).find('a').text();
                                    pupils.push({ order: i, id, name, });
                                });
                            $(data)
                                .find('.mtable tbody tr')
                                .each((i, tr) => {
                                    const id = parseInt(tr.getAttribute('pupil_id'));
                                    $(tr)
                                        .find('.qmark, .ymark')
                                        .each((i, m) => {
                                            const mark = m.textContent.trim();
                                            marks.push({
                                                pupil_id: id,
                                                quarter_id: m.getAttribute('quarter_id') ?? 'year' + getAcademicYearSecondPart(new Date()),
                                                value: getDic[mark] ?? mark
                                            })
                                        });
                                });
                            const quarters = new Map([...$(data)
                                .find('.mtable tbody tr')
                                .first()
                                .find('.qmark')
                                .map((i, m) => ([[
                                    m.getAttribute('quarter_id'),
                                    'Четверть ' + (i + 1)
                                ]]))
                                .toArray(),
                            {
                                quarter_id: 'year' + getAcademicYearSecondPart(new Date()),
                                caption: 'Год ' + getAcademicYearSecondPart(new Date())
                            }
                            ]);
                            resolve({ pupils, marks, quarters });
                        }
                    });
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

    async function onLoadSelectedBtnClick() {
        const tasks = $('#subjList input:checked')
            .parent()
            .map(async (i, e) => {
                const subject_id = e.getAttribute('data-subject');
                const marks = await getSubjectMarksAsync({ subject_id });
                marks.subjIndex = i;
                marks.subject_id = subject_id;
                return marks;
            })
            .toArray();
        const subjectsData = (await Promise.all(tasks)).sort((a, b) => a.subjIndex - b.subjIndex);
        console.log(subjectsData);

        const quartersData = new Map();
        subjectsData.forEach(({ marks, pupils, subject_id, quarters }) => {
            marks.forEach(({ pupil_id, quarter_id, value }) => {
                let quarter;
                if (quartersData.has(quarter_id)) {
                    quarter = quartersData.get(quarter_id);
                }
                else {
                    quarter = new Map(pupils.map(({ id, name }, i) => ([id, { id, order: i + 1, name, marks: new Map() }])));
                    quarter.caption = quarters.get(quarter_id);
                    quartersData.set(quarter_id, quarter)
                }

                const pupil = quarter.get(pupil_id);
                pupil.marks.set(subject_id, value);
            });
        });
        console.log(quartersData);

        quartersData.forEach((quarter, quarter_id) => {
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

            let textBuf = '';
            const tbody = $('<tbody/>')
                .appendTo(table);

            quarter.values().toArray().forEach(({ order, id, name, marks }, i) => {
                const tr = $(`<tr pupil_id='${id}'><th>${order}</th><th>${name}</th></tr>`)
                    .appendTo(tbody);
                $('#subjList input:checked')
                    .parent()
                    .each(async (i, e) => {
                        const subject_id = e.getAttribute('data-subject');
                        const mark = marks.get(subject_id) ?? "Предмет не загружен";
                        textBuf += mark + '\t';
                        tr.append(`<td>${mark}</td>`);
                    });
                textBuf += '\r\n';
            });
            table
                .before($(`<button class='btn'>(${quarter.caption}) копировать</button>`).click(async () => {
                    await navigator.clipboard.writeText(textBuf);
                    alert('скопировано');
                }));
        });

        alert('Данные загружены');
    }

    jQuery(document).ready(function ($) {
        $('.title_box h1').click(() => {
            navigator.clipboard.writeText($('.pupil').map((i, e) => `=ПОИСК("${e.innerText.trim()}";$B${6 + i})=1`).toArray().join("\n"))
        });

        GM_addStyle(
            `   .btn{
                    border: 1px solid #8444fb !important
                    padding: 6px !important;
                }
                .btn:hover {
                    background: #8444fb;
                    color: white;
                    transition: all .2s;
                }    
                .table {
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

function getAcademicYearSecondPart(date) {
    let year = date.getFullYear();
    let month = date.getMonth() + 1; // месяцы начинаются с 0, поэтому добавляем 1

    // Учебный год обычно начинается осенью, например, с сентября (9 месяца)
    return month >= 9 ? year + 1 : year;
}

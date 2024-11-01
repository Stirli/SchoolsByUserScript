// ==UserScript==
// @name         CopyPasteClass
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description
// @author       You
// @match        https://*.schools.by/class/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=schools.by
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';
    jQuery(document).ready(function ($) {

        $('.title_box h1').click(() => {
            window.navigator.clipboard.writeText($('.pupil').map((i, e) => `=ПОИСК("${e.innerText.trim()}";$B${6 + i})=1`).toArray().join("\n"))
        })

        const class_id = window.location.href.match(/class\/(\d+)/)[1];
        let quarter_id = 84

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

        function getQuarterMarksAsync(subjectLink, subjectOrder) {
            return new Promise((resolve) => {
                jQuery.ajax({
                    url: window.location.origin + '/journal/' + subjectLink + '/quarter/' + quarter_id,
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
                        resolve({ index: subjectOrder ?? 0, arr });
                    }
                });
            })
        }

        const marksEx1 = ["з.", "н/а", "осв.", ''];
        const marksEx2 = ["ЗЧ", "НУ", "ОСВ", "НИ"];

        const setDic = marksEx2.dic([-2, -4, -5, null]);
        const getDic = marksEx1.dic(marksEx2);

        GM_addStyle(
            `.tbl {
                    display: flex;
                    flex-direction: column;
                    align-items: stretch;
                }
                .tbl tr {
                        flex-direction: row;
                        justify-content: space-between;
                        display: flex;
                }
                .tbl td {
                    width: -webkit-fill-available;
                    border: 1px gray solid;
                    padding: 4px;
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

        $('.tabs1_wrap').before($('<div class="btn">Четвертные оценки</div>').click(function () {
            // $('.tabs1_wrap').empty();
            $("#subj_quart_copy_wrap").empty();
            $('.grid_pst')
                .after($("<div id='subj_quart_copy_wrap' class='line_small'><p>Нажмите на предмет, чтобы добавить его в список.<br>Удерживайте при этом Ctrl, чтобы сразу скопировать его в буфер обмена</p><ol id='subjList'/><p>Выбрано:</p><ol id='subjCopyList'/></div>")
                    .append($("<div class='btn'>Добавить всё</div>")
                        .click(function () {
                            $('#subjList a').click();
                        }))
                    .append($("<div class='btn'>Копировать выбранное</div>")
                        .click(async function () {
                            const tasks = $('#subjCopyList a')
                                .map((i, e) => getQuarterMarksAsync(e.getAttribute('data-link'), i))
                                .toArray();
                            const tableArr = (await Promise.all(tasks)).sort((a, b) => a.index - b.index);
                            let textBuf = '';
                            let table = $("<table class='tbl'/>").appendTo("#subj_quart_copy_wrap");
                            const marksCount = tableArr[0].arr.length;

                            for (let i = 0; i < marksCount; i++) {
                                const lineArr = tableArr.map(v => v.arr[i]);
                                table.append(`<tr>${lineArr.map(el => `<td>${el}</td>`).join()}</tr>`);
                                textBuf += lineArr.join('\t') + '\r\n';
                            }

                            console.log(textBuf);
                            await navigator.clipboard.writeText(textBuf);
                            alert('скопировано');
                        }))
                );
            jQuery.ajax({
                url: `https://${window.location.host}/class/${class_id}/lessons`,
                type: 'get',
                dataType: 'html',
                success: function (data) {
                    const arr = $(data)
                        .find(".sbp a")
                        .map((i, e) => ({ i: subjects[e.innerText.trim()], link: e.href.match(/lessons\/(\d+)/)[1], name: e.innerText.trim() }))
                        .toArray()
                        .filter(e => e.i)
                        .sort((e1, e2) => e1.i - e2.i)
                        .map((el) => {
                            let { link, name } = el;
                            return $(`<a class="lnk" data-link="${link}">${name}</a>`)
                                .click(async function (event) {
                                    console.log(this);
                                    if (event.ctrlKey) {
                                        const { _, arr } = await getQuarterMarksAsync(this.getAttribute('data-link'));
                                        await window.navigator.clipboard.writeText(arr.join("\r\n"));
                                        alert('Скопировано');
                                        event.preventDefault();
                                        return;
                                    }

                                    $(this).clone()
                                        .appendTo($("#subjCopyList"))
                                        .wrap('<li></li>')
                                        .click(function () {
                                            $(this).parent().remove();
                                        });
                                })
                                .appendTo($("#subjList"))
                                .wrap("<li></li>")
                                .click();
                        })

                    console.log(arr);
                }
            });
        }));
    });
})();

// ==UserScript==
// @name         DownloadAllMarks
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description
// @author       Stirli
// @match        https://*.schools.by/classes
// @icon         https://www.google.com/s2/favicons?sz=64&domain=schools.by
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery-scrollTo/2.1.3/jquery.scrollTo.min.js
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    function initEmptyUI() {
        // create or reuse container inside .title_box
        const titleBox = $('.title_box');
        if (!titleBox.length) return;

        titleBox.find('#subj_quart_copy_wrap').remove();

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
                    <br>Выберите предметы и нажмите "Загрузить выбранное" — будет скачан CSV-файл.</p>
                    <div id="subj_progress" style="display:none; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div id="subj_progress_bar" style="flex:1; height:12px; background:#eee; border-radius:6px; overflow:hidden;"><div id="subj_progress_fill" style="width:0%; height:100%; background:#28a745;"></div></div>
                            <div id="subj_progress_text" style="min-width:220px; font-size:12px;color:#333"></div>
                            <button id="subj_progress_cancel" class="btn">Отменить</button>
                        </div>
                        <div id="subj_class_progress" style="margin-top:8px;">
                        </div>
                            <div id="subj_failed" style="display:none; margin-top:8px;">
                                <div style="font-weight:bold; margin-bottom:6px;">Неудачные предметы</div>
                                <ol id="subj_failed_list" style="margin:0 0 8px 16px"></ol>
                                <div style="display:flex; gap:8px;">
                                    <button id="subj_failed_retry" class="btn">Повторить неудачные</button>
                                    <button id="subj_failed_merge" class="btn" style="display:none;">Добавить ретрай в CSV</button>
                                </div>
                            </div>
                    </div>
                </div>`)
            .append(selectAllBtn)
            .append(cancelAllBtn)
            .append(loadSelectedBtn)
            .append('<div id="subj_controls" style="margin-top:8px;"></div>')
            .append('<ol id="subjList"/>');

        titleBox.append(pluginUiBody);

        // bind cancel
        titleBox.find('#subj_progress_cancel').click(() => {
            window.__downloadCancelled = true;
            if (window.__abortActiveRequests) window.__abortActiveRequests();
        });
        // failed retry button
        titleBox.find('#subj_failed_retry').off('click').on('click', () => {
            if (window.__failedTasks && window.__failedTasks.length) {
                retryFailedTasks();
            }
        });
        // merge retry results into CSV button
        titleBox.find('#subj_failed_merge').off('click').on('click', () => {
            const last = window.__lastRetryRows || [];
            if (!last.length) { alert('Нет данных ретрая для добавления'); return; }
            window.__exportRows = (window.__exportRows || []).concat(last);
            const fname = window.__exportFilename || `marks_export_${Date.now()}.csv`;
            buildAndDownloadCsv(window.__exportRows, fname);
            // clear last retry rows and hide merge button
            window.__lastRetryRows = [];
            titleBox.find('#subj_failed_merge').hide();
            alert('Результаты ретрая добавлены и CSV скачан');
        });
    }

    // abort currently active XHRs
    if (!window.__activeXhrs) window.__activeXhrs = new Set();
    window.__abortActiveRequests = function () {
        try {
            for (const x of Array.from(window.__activeXhrs)) {
                try { x.abort(); } catch (e) { }
            }
        } finally {
            window.__activeXhrs.clear();
        }
    };


    async function getSubjectMarksAsync({ subject_id }) {
        let url = window.location.origin + '/journal/' + subject_id;
        // compute academic year once per subject fetch
        return new Promise((resolve, reject) => {
            if (!window.__activeXhrs) window.__activeXhrs = new Set();
            const xhr1 = jQuery.ajax({
                url,
                type: 'get',
                dataType: 'html',
                success: function (data) {
                    const url2 = $(data)
                        .find('#journal_quarters_menu ul')
                        .last()
                        .find(".quarters")
                        .attr('src');

                    const xhr2 = jQuery.ajax({
                        url: url2,
                        type: 'get',
                        dataType: 'html',
                        success: function (data) {
                            const academicYear = $(data).find(".j_info b").text().trim();
                            const pupils = [];
                            const marks = [];
                            $(data)
                                .find('.ltable tbody tr')
                                .each((i, tr) => {
                                    const id = parseInt(tr.getAttribute('pupil_id'));
                                    console.log('год', academicYear, 'id', id);
                                    const name = $(tr).find('a').text().trim();
                                    pupils.push({ order: i, id, name, });
                                });
                            $(data)
                                .find('.mtable tbody tr')
                                .each((i, tr) => {
                                    const id = parseInt(tr.getAttribute('pupil_id'));
                                    $(tr)
                                        .find('.qmark, .ymark, .emark, .tmark')
                                        .each((i, m) => {
                                            const mark = m.textContent.trim();
                                            let quarterId = null;
                                            const cls = (m.getAttribute('class') || '');
                                            if ((cls.indexOf('qmark') !== -1)) {
                                                const rawQ = m.getAttribute('quarter_id');
                                                quarterId = rawQ ? (rawQ + '_' + academicYear) : ('' + '_' + academicYear);
                                            } else if ((cls.indexOf('ymark') !== -1)) {
                                                quarterId = 'year_' + academicYear;
                                            } else if ((cls.indexOf('emark') !== -1)) {
                                                quarterId = 'exam_' + academicYear;
                                            } else if ((cls.indexOf('tmark') !== -1)) {
                                                quarterId = 'total_' + academicYear;
                                            }
                                            marks.push({
                                                pupil_id: id,
                                                quarter_id: quarterId,
                                                value: getDic[mark] ?? mark
                                            })
                                        });
                                });
                            // build quarters map: quarters from qmark plus exam/total/year
                            const quarters = new Map();
                            $(data).find('.mtable tbody tr').first().find('.qmark').each((i, m) => {
                                const raw = m.getAttribute('quarter_id');
                                const qid = raw ? (raw + '_' + academicYear) : ('_' + academicYear);
                                quarters.set(qid, 'Четверть ' + (i + 1));
                            });
                            quarters.set('exam_' + academicYear, 'Экзамен');
                            quarters.set('total_' + academicYear, 'Итог');
                            quarters.set('year_' + academicYear, 'Год');
                            resolve({ pupils, marks, quarters, academicYear });
                        },
                        error: function (xhr, status, err) {
                            if (status === 'abort') reject({ abort: true });
                            else reject(err || status);
                        },
                        complete: function (r) { try { window.__activeXhrs.delete(xhr2); } catch (e) { } }
                    });
                    try { window.__activeXhrs.add(xhr2); } catch (e) { }
                },
                error: function (xhr, status, err) {
                    if (status === 'abort') reject({ abort: true });
                    else reject(err || status);
                },
                complete: function () { try { window.__activeXhrs.delete(xhr1); } catch (e) { } }
            });
            try { window.__activeXhrs.add(xhr1); } catch (e) { }
        });
    }

    async function fillSubjectsListAsync() {
        // build class list UI and allow user to select which classes to include
        const classLinks = $('.classes_main_box a').toArray();
        const classInfos = classLinks
            .map(a => {
                const href = a.getAttribute('href') || '';
                const m = href.match(/class\/(\d+)/) || href.match(/(\d+)/);
                const id = m ? m[1] : null;
                const rawName = (a.innerText || a.textContent || '').trim();
                // parse class parallel and letter by regex
                let parallel = '';
                let letter = '';
                const quoted = rawName.match(/(\d{1,2})[^"'«»“”`]*["'«»“”](.+?)["'«»“”]/);
                if (quoted) {
                    parallel = quoted[1];
                    letter = quoted[2];
                } else {
                    const simple = rawName.match(/(\d{1,2})\s*[-–—]?\s*([A-Za-z0-9А-Яа-яЁё\-\u2013\u2014_]+)?/);
                    if (simple) {
                        parallel = simple[1];
                        letter = simple[2] || '';
                    }
                }
                const name = parallel ? (parallel + (letter ? ` "${letter}"` : '')) : rawName;
                const hrefFull = a.href || href;
                return id ? { id, name, href: hrefFull, parallel, letter, rawName } : null;
            })
            .filter(Boolean);

        // integrate class checkboxes into existing .classes_main_box .class elements
        const savedClasses = JSON.parse(localStorage.getItem('downloadMarks_selectedClasses') || 'null');
        $('.classes_main_box .class').each((i, el) => {
            const $el = $(el);
            const a = $el.find('a').first();
            const href = a.attr('href') || a.prop('href') || '';
            const m = href.match(/class\/(\d+)/) || href.match(/(\d+)/);
            const classId = m ? m[1] : null;
            if (!classId) return;
            // don't duplicate checkbox
            if ($el.find('.download-class-chk').length) return;
            const checked = savedClasses ? savedClasses.includes(classId) : true;
            const $chk = $(`<input type="checkbox" class="download-class-chk" data-classid="${classId}" ${checked ? 'checked' : ''} style="margin-right:8px;"/>`);
            // insert before the link, with padding to avoid accidental click
            $chk.prependTo($el).wrap(`<div style="vertical-align: middle; display: grid;"></div>`);
            $el.attr("style", `display: grid; grid-auto-flow: column;`);
        });

        // add select/clear controls to .classes_main_box (if not already present)
        const classBox = $('.classes_main_box');
        if (classBox.length && !classBox.find('.download-class-controls').length) {
            const controls = $(`<div class="download-class-controls" style="margin:8px 0 12px 0; display:flex; gap:8px;"></div>`);
            const btnAll = $(`<button type="button" class="btn">Выбрать все классы</button>`);
            const btnNone = $(`<button type="button" class="btn">Отменить выбор классов</button>`);
            controls.append(btnAll).append(btnNone);
            classBox.prepend(controls);

            btnAll.click(() => {
                $('.download-class-chk').prop('checked', true).trigger('change');
            });
            btnNone.click(() => {
                $('.download-class-chk').prop('checked', false).trigger('change');
            });
        }

        // persist class checkbox changes
        $('.download-class-chk').off('change').on('change', () => {
            const sel = $('.download-class-chk:checked').map((i, e) => e.getAttribute('data-classid')).toArray();
            localStorage.setItem('downloadMarks_selectedClasses', JSON.stringify(sel));
        });

        // aggregate lessons from selected classes
        const subjectsMap = {}; // name -> array of {id, class_id, class_name}
        const selectedClassIds = $('.download-class-chk:checked').map((i, e) => e.getAttribute('data-classid')).toArray();

        for (const { id: class_id, name: class_name, parallel: class_parallel, letter: class_letter } of classInfos) {
            if (!selectedClassIds.includes(class_id)) continue;
            const lessons = await getClassLessonsAsync(class_id);
            lessons.forEach(({ id, name }) => {
                const key = name.trim();
                subjectsMap[key] = subjectsMap[key] || [];
                subjectsMap[key].push({ id, class_id, class_name, class_parallel, class_letter });
            });
        }

        // store aggregated subjects for later use
        window.__aggregatedSubjects = subjectsMap;

        // render list: subjects from predefined `subjects` first (in that order), others appended
        const predefinedOrder = Object.keys(subjects || {});
        const rendered = new Set();
        const savedSubjects = JSON.parse(localStorage.getItem('downloadMarks_selectedSubjects') || 'null');
        predefinedOrder.forEach(name => {
            if (subjectsMap[name]) {
                const safeId = name.replace(/[^a-z0-9_\-]/gi, '_');
                const checked = savedSubjects ? savedSubjects.includes(name) : false;
                $(`<li data-subject="${name}"><input id="subj${safeId}Check" type="checkbox" ${checked ? 'checked' : ''}><label for="subj${safeId}Check">${name}</label></li>`)
                    .click(onSelectSubjectLinkClick)
                    .appendTo($("#subjList"));
                rendered.add(name);
            }
        });

        Object.keys(subjectsMap).sort().forEach(name => {
            if (rendered.has(name)) return;
            const safeId = name.replace(/[^a-z0-9_\-]/gi, '_');
            const checked = savedSubjects ? savedSubjects.includes(name) : false;
            $(`<li data-subject="${name}"><input id="subj${safeId}Check" type="checkbox" ${checked ? 'checked' : ''}><label for="subj${safeId}Check">${name}</label></li>`)
                .click(onSelectSubjectLinkClick)
                .appendTo($("#subjList"));
        });

        // bind subject checkbox change to save
        $('#subjList input[type=checkbox]').change(() => {
            const sel = $('#subjList input[type=checkbox]:checked').parent().map((i, e) => e.getAttribute('data-subject')).toArray();
            localStorage.setItem('downloadMarks_selectedSubjects', JSON.stringify(sel));
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
                        .map((i, e) => ({ id: (e.href.match(/lessons\/(\d+)/) || [])[1], name: e.innerText.trim() }))
                        .toArray()
                        .filter(e => e.id);
                    resolve(arr);
                }
            });
        });
    }

    async function getQuarterMarksAsync({ subject_id, quarter_id, subject_order }) {
        let url = window.location.origin + '/journal/' + subject_id + '/quarter/' + quarter_id;

        return new Promise((resolve) => {
            if (!window.__activeXhrs) window.__activeXhrs = new Set();
            const xhr = jQuery.ajax({
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
                },
                error: function (xhr, status, err) {
                    if (status === 'abort') resolve({ index: subject_order ?? 0, arr: [] });
                    else resolve({ index: subject_order ?? 0, arr: [] });
                },
                complete: function () { try { window.__activeXhrs.delete(xhr); } catch (e) { } }
            });
            try { window.__activeXhrs.add(xhr); } catch (e) { }
        });
    }

    async function onSelectSubjectLinkClick(event) {
        if (event.ctrlKey) {
            const subjectName = this.getAttribute('data-subject');
            const entries = (window.__aggregatedSubjects && window.__aggregatedSubjects[subjectName]) || [];
            let allArr = [];
            for (const entry of entries) {
                const { arr } = await getQuarterMarksAsync({ subject_id: entry.id }) || { arr: [] };
                allArr = allArr.concat(arr || []);
            }
            focus();
            await navigator.clipboard.writeText(allArr.join("\r\n"));
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
        // Build CSV rows for all selected subjects across all classes
        const checked = $('#subjList input:checked').parent().toArray();
        const rows = [];

        // prepare total tasks list (subject-class pairs) and per-class totals for progress
        const selectedClassIds = $('.download-class-chk:checked').map((i, e) => e.getAttribute('data-classid')).toArray();
        const tasks = []; // each task: {subjectName, subject_id, class_id, class_name}
        const classTotals = {};
        for (const li of checked) {
            const subjectName = li.getAttribute('data-subject');
            const entries = (window.__aggregatedSubjects && window.__aggregatedSubjects[subjectName]) || [];
            const filtered = entries.filter(en => selectedClassIds.includes(String(en.class_id)));
            filtered.forEach(en => {
                tasks.push({ subjectName, subject_id: en.id, class_id: String(en.class_id), class_name: en.class_name || String(en.class_id), class_parallel: en.class_parallel || '', class_letter: en.class_letter || '' });
                classTotals[String(en.class_id)] = (classTotals[String(en.class_id)] || 0) + 1;
            });
        }

        const totalTasks = tasks.length;

        window.__downloadCancelled = false;
        // show progress
        $('#subj_progress').show();
        $('#subj_class_progress').empty();
        // render per-class lines
        const classDone = {};
        const classErrors = {};
        Object.keys(classTotals).forEach(cid => {
            classDone[cid] = 0;
            classErrors[cid] = 0;
            const cname = (tasks.find(t => t.class_id === cid) || {}).class_name || cid;
            const $line = $(`<div id="class_progress_${cid}" style="font-size:12px; margin-bottom:4px;">${cname}: 0/${classTotals[cid]} (Ошибки: 0)</div>`);
            $('#subj_class_progress').append($line);
        });

        const updateProgress = (done, currentTask) => {
            const pct = totalTasks ? Math.round((done / totalTasks) * 100) : 0;
            $('#subj_progress_fill').css('width', pct + '%');
            const curClass = currentTask ? currentTask.class_name : '';
            const curSubject = currentTask ? currentTask.subjectName : '';
            $('#subj_progress_text').text(`${done}/${totalTasks} — ${curClass} — ${curSubject}`);
            // update per-class lines
            if (currentTask) {
                const cid = currentTask.class_id;
                const doneCount = classDone[cid] || 0;
                $(`#class_progress_${cid}`).text(`${currentTask.class_name}: ${doneCount}/${classTotals[cid]}`);
            }
        };

        // create task functions
        // ensure failedTasks container
        if (!window.__failedTasks) window.__failedTasks = [];

        const taskFns = tasks.map(task => {
            return async () => {
                if (window.__downloadCancelled) return;
                try {
                    const data = await getSubjectMarksAsync({ subject_id: task.subject_id });
                    const pupils = data.pupils || [];
                    const pupilMap = {};
                    pupils.forEach(p => { pupilMap[p.id] = p.name; });
                    const marks = data.marks || [];
                    const quarters = data.quarters || new Map();
                    const academicYear = data.academicYear || '';
                    marks.forEach(m => {
                        const pupilName = pupilMap[m.pupil_id] || '';
                        const quarterCaption = quarters.get(m.quarter_id) || m.quarter_id;
                        rows.push({ class_name: task.class_name, class_id: task.class_id, class_parallel: task.class_parallel || '', class_letter: task.class_letter || '', academic_year: academicYear, subject: task.subjectName, pupil_id: m.pupil_id, pupil: pupilName, quarter: quarterCaption, mark: m.value });
                    });
                } catch (e) {
                    console.error('Task error', e);
                    // treat non-abort errors as task errors
                    if (!(e && e.abort)) {
                        classErrors[task.class_id] = (classErrors[task.class_id] || 0) + 1;
                        window.__failedTasks.push(task);
                    }
                } finally {
                    classDone[task.class_id] = (classDone[task.class_id] || 0) + 1;
                    done++;
                    updateProgress(done, task);
                }
            };
        });

        // run with concurrency limit
        async function runPool(fns, limit) {
            return new Promise(resolve => {
                let i = 0;
                let active = 0;
                let finished = 0;
                function next() {
                    if (window.__downloadCancelled) { resolve(); return; }
                    while (active < limit && i < fns.length) {
                        const idx = i++;
                        active++;
                        fns[idx]().then(() => {
                            active--; finished++; if (finished === fns.length) resolve(); else next();
                        }).catch(() => { active--; finished++; if (finished === fns.length) resolve(); else next(); });
                    }
                    if (fns.length === 0) resolve();
                }
                next();
            });
        }

        let done = 0;
        await runPool(taskFns, 4);

        // show failed tasks if any
        if (window.__failedTasks && window.__failedTasks.length) {
            $('#subj_failed').show();
            $('#subj_failed_list').empty();
            window.__failedTasks.forEach(t => {
                $('#subj_failed_list').append(`<li>${t.class_name} / ${t.class_id} — ${t.subjectName}</li>`);
            });
            // hide merge button until a retry has produced rows
            $('#subj_failed_merge').hide();
        } else {
            $('#subj_failed').hide();
            $('#subj_failed_list').empty();
        }

        if (window.__downloadCancelled) {
            $('#subj_progress').hide();
            alert('Загрузка отменена');
            return;
        }

        if (!rows.length) {
            $('#subj_progress').hide();
            alert('Нет данных для выгрузки');
            return;
        }

        // persist exported rows and filename, then download via helper
        window.__exportRows = (window.__exportRows || []).concat(rows);
        window.__exportFilename = `marks_export_${Date.now()}.csv`;
        buildAndDownloadCsv(window.__exportRows, window.__exportFilename);
        $('#subj_progress').hide();
        alert('CSV файл скачан');
    }

    // retry failed tasks function
    async function retryFailedTasks() {
        const failed = window.__failedTasks || [];
        if (!failed.length) return;
        // reset counters and UI
        window.__downloadCancelled = false;
        $('#subj_progress').show();
        $('#subj_class_progress').empty();

        const tasks = failed.map(en => ({ subjectName: en.subjectName, subject_id: en.subject_id, class_id: en.class_id, class_name: en.class_name, class_parallel: en.class_parallel || '', class_letter: en.class_letter || '' }));
        const classTotals = {};
        tasks.forEach(t => { classTotals[t.class_id] = (classTotals[t.class_id] || 0) + 1; });
        const classDone = {}; const classErrors = {};
        Object.keys(classTotals).forEach(cid => { classDone[cid] = 0; classErrors[cid] = 0; const cname = (tasks.find(t => t.class_id === cid) || {}).class_name || cid; $('#subj_class_progress').append(`<div id="class_progress_${cid}" style="font-size:12px; margin-bottom:4px;">${cname}: 0/${classTotals[cid]} (Ошибки: 0)</div>`); });

        const rows = [];
        if (!window.__failedTasks) window.__failedTasks = [];
        const taskFns = tasks.map(task => {
            return async () => {
                if (window.__downloadCancelled) return;
                try {
                    const data = await getSubjectMarksAsync({ subject_id: task.subject_id });
                    const pupils = data.pupils || [];
                    const pupilMap = {};
                    pupils.forEach(p => { pupilMap[p.id] = p.name; });
                    const marks = data.marks || [];
                    const quarters = data.quarters || new Map();
                    const academicYear = data.academicYear || '';
                    marks.forEach(m => { rows.push({ class_name: task.class_name, class_id: task.class_id, class_parallel: task.class_parallel || '', class_letter: task.class_letter || '', academic_year: academicYear, subject: task.subjectName, pupil_id: m.pupil_id, pupil: pupilMap[m.pupil_id] || '', quarter: quarters.get(m.quarter_id) || m.quarter_id, mark: m.value }); });
                } catch (e) {
                    console.error('Retry task error', e);
                    if (!(e && e.abort)) {
                        classErrors[task.class_id] = (classErrors[task.class_id] || 0) + 1;
                        window.__failedTasks.push(task);
                    }
                } finally {
                    classDone[task.class_id] = (classDone[task.class_id] || 0) + 1;
                    // update UI
                    $(`#class_progress_${task.class_id}`).text(`${task.class_name}: ${classDone[task.class_id]}/${classTotals[task.class_id]} (Ошибки: ${classErrors[task.class_id] || 0})`);
                }
            };
        });

        async function runPoolLocal(fns, limit) {
            return new Promise(resolve => {
                let i = 0; let active = 0; let finished = 0;
                function next() {
                    if (window.__downloadCancelled) { resolve(); return; }
                    while (active < limit && i < fns.length) {
                        const idx = i++; active++;
                        fns[idx]().then(() => { active--; finished++; if (finished === fns.length) resolve(); else next(); }).catch(() => { active--; finished++; if (finished === fns.length) resolve(); else next(); });
                    }
                    if (fns.length === 0) resolve();
                }
                next();
            });
        }

        window.__failedTasks = [];
        await runPoolLocal(taskFns, 4);

        // update failed list
        if (window.__failedTasks && window.__failedTasks.length) {
            $('#subj_failed').show();
            $('#subj_failed_list').empty();
            window.__failedTasks.forEach(t => { $('#subj_failed_list').append(`<li>${t.class_name} / ${t.class_id} — ${t.subjectName}</li>`); });
        } else {
            $('#subj_failed').hide(); $('#subj_failed_list').empty();
        }

        // keep export state for possible retry merging and let user merge manually
        window.__exportRows = window.__exportRows || [];
        // store retry rows for manual merge
        window.__lastRetryRows = rows || [];
        if (window.__lastRetryRows.length) {
            $('#subj_failed_merge').show();
        } else {
            $('#subj_failed_merge').hide();
        }
    }

    jQuery(document).ready(function ($) {
        GM_addStyle(INJECTED_CSS);
        $('.title_box h1').click(() => {
            navigator.clipboard.writeText($('.pupil').map((i, e) => `=ПОИСК("${e.innerText.trim()}";$B${6 + i})=1`).toArray().join("\n"))
        });
        $('.title_box')
            .append($('<button class="btn">Четвертные оценки</button>')
                .click(onQuarterMarksButtonClick));
    });
})();

const INJECTED_CSS =
    `.btn{
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
                }

                #subj_quart_copy_wrap {
                    margin: 10px 0;
                }
                #subj_quart_copy_wrap .btn {
                    display: inline-block;
                    padding: 5px 10px;
                    background-color: #007bff;
                    color: white;
                    border-radius: 5px;
                    cursor: pointer;
                    margin-right: 5px;
                }
                #subj_quart_copy_wrap .btn:hover {
                    background-color: #0056b3;
                }
                #subjList {
                    list-style-type: none;
                    padding-left: 0;
                }
                #subjList li {
                    margin-bottom: 5px;
                }
                #subjList input[type="checkbox"] {
                    margin-right: 5px;
                }`;

function ArrayToDictionary(arr1, arr2) {
    if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
        throw new Error("Both arguments must be arrays");
    }

    if (arr1.length != arr2.length) {
        throw new Error("arr2 must be same length");
    }

    const dic = {};
    for (let i = 0; i < arr1.length; i++) {
        dic[arr1[i]] = arr2[i];
    }

    return dic;
}

const marksEx1 = ["з.", "н/а", "осв.", 'н/и'];
const marksEx2 = ["ЗЧ", "НУ", "ОСВ", "НИ"];

const setDic = ArrayToDictionary(marksEx2, [-2, -4, -5, null]);
const getDic = ArrayToDictionary(marksEx1, marksEx2);

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
    }, {});

// Helper: build CSV from rows, encode to CP1251 and trigger download
function buildAndDownloadCsv(rows, filename) {
    const header = ['ClassName', 'ClassId', 'ClassParallel', 'ClassLetter', 'AcademicYear', 'Subject', 'PupilId', 'PupilName', 'Quarter', 'Mark'];
    const escape = v => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.indexOf(';') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    };

    const lines = [header.join(';')].concat(rows.map(r => [r.class_name || '', r.class_id || '', r.class_parallel || '', r.class_letter || '', r.academic_year || '', r.subject, r.pupil_id, r.pupil, r.quarter || r.quarter_caption || '', r.mark].map(escape).join(';')));
    const csv = lines.join('\r\n');

    function stringToCp1251Bytes(str) {
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code < 128) {
                bytes.push(code);
            } else if (code >= 0x410 && code <= 0x44F) {
                bytes.push(code - 0x410 + 0xC0);
            } else if (code === 0x0401) {
                bytes.push(0xA8);
            } else if (code === 0x0451) {
                bytes.push(0xB8);
            } else {
                if (code === 0x2013 || code === 0x2014) {
                    bytes.push(45);
                } else if (code === 0x201C || code === 0x201D) {
                    bytes.push(34);
                } else if (code === 0x00A0) {
                    bytes.push(32);
                } else {
                    bytes.push(63);
                }
            }
        }
        return new Uint8Array(bytes);
    }

    const csvBytes = stringToCp1251Bytes(csv);
    const blob = new Blob([csvBytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `marks_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
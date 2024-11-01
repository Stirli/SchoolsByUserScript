// ==UserScript==
// @name         Class Selector
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Adds class selector drop box
// @author       Stirli
// @match        https://*.schools.by/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=schools.by
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    $.noConflict();
    jQuery(document).ready(function ($) {

        jQuery.fn.reverse = [].reverse;
        const currentClassId = window.location.href.match(/class\/(\d+)/)?.[1];

        $(`<select id="classSelector"></select`)
            .appendTo('.kroshki')
            .on('change', function () {
                const newClass = $(this).find('option:selected').attr('value');
                window.location.href = /class\/(\d+)/.test(window.location.href)
                    ? window.location.href.replace(currentClassId, newClass)
                    : window.location.href = `/class/${newClass}`;
            }).on('wheel', function ({ originalEvent: event }) {
                const item = $(this).find(':selected')[event.deltaY > 0 ? 'next' : (event.deltaY < 0 ? 'prev' : undefined)]().get(0);
                if (item) {
                    $(this).val(item.value).change();
                }

                event.preventDefault();
            });
        jQuery.ajax({
            url: `https://${window.location.host}/classes`,
            type: 'get',
            dataType: 'html',
            success: function (data) {
                const selectBody = $(data).find('.sch_classes_list .line')
                    .toArray()
                    .reverse()
                    .map((line) => $(line)
                        .find('.class a')
                        .toArray()
                        .map(cls => {
                            const classId = cls.getAttribute('href').match(/(\d+)/)?.[1]
                            let selected = '';
                            if (currentClassId === classId) {
                                selected = 'selected';
                            }

                            let optionBody = `<option value="${classId}" ${selected}>${cls.innerText.trim()}</option>`;
                            return optionBody;
                        }))
                    .flat()
                    .join('\n');
                $('#classSelector').html(selectBody);
            }
        });
    });
})();
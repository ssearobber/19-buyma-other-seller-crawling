const puppeteer = require('puppeteer');
const dayjs = require('dayjs');

const OtherSeller = require('../models/otherSeller');
const sequelize = require('sequelize');

// buyma 데이터 크롤링
async function buyma() {
  const userId = process.env.USER_ID || userId;
  let browser = {};
  let page = {};

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        // '--window-size=1920,1080',
        // '--disable-notifications',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    // 전체 상품 리스트로 취득
    let isDataInThePage = true;
    let pageNum = 1;
    let today = dayjs().format('YYYY/MM/DD');
    let totalSellers = [];
    let sellers = [];
    let isDataInPage = false;
    while (isDataInThePage) {
      console.log(`https://www.buyma.com/r/-C1004_${pageNum}/에 이동`);

      page = await browser.newPage();
      // await page.setViewport({
      //   width: 1480,
      //   height: 1080,
      // });
      await page.setDefaultNavigationTimeout(0);
      let response = await page.goto(`https://www.buyma.com/r/-C1004_${pageNum}/`, {
        waitUntil: 'networkidle0',
        // timeout: 30000,
      });
      if (!response) {
        throw 'Failed to load page!';
      }

      await page.waitForTimeout(20000); // 없으면 크롤링 안됨

      console.log('데이터 존재 체크 시작.');
      isDataInPage = false;
      isDataInPage = await page.evaluate(() => {
        let isCheckDataInPage = document.querySelectorAll('ul li .product_Buyer a').length;
        return isCheckDataInPage;
      });
      console.log('데이터 존재 체크 종료.');

      if (isDataInPage) {
        // 데이터 크롤링
        console.log('데이터 크롤링 시작.');
        sellers = await page.evaluate(() => {
          let tags = document.querySelectorAll('ul li .product_Buyer a');
          let sellers = [];
          tags.forEach((t) => {
            sellers.push({
              buymaUserId: t && t.href.match(/\d{7}|\d{6}/g),
              buymaUserName: t && t.textContent,
              buymaHomeUrl: t && t.href,
            });
          });
          return sellers;
        });

        totalSellers.push(...sellers);
        pageNum++;

        await page.close();
      } else {
        isDataInThePage = false;
        await browser.close();
        console.log('데이터 크롤링 종료.');

        console.log('otherSeller테이블의 데이터 upsert시작.');
        let deduplicationTotalSellers = totalSellers.filter(
          (arr, index, callback) =>
            index === callback.findIndex((t) => t.buymaUserName === arr.buymaUserName),
        );

        for (let seller of deduplicationTotalSellers) {
          if (seller.buymaUserId[0]) {
            try {
              await OtherSeller.upsert({
                user_id: 'all',
                buyma_user_id: seller.buymaUserId[0],
                buyma_user_name: seller.buymaUserName,
                buyma_home_url: seller.buymaHomeUrl,
                create_id: 'crawling',
                date_created: today,
                update_id: 'crawling',
                last_updated: today,
              });
            } catch (e) {
              console.log('upsert error', e);
            }
          }
        }
        console.log('otherSeller테이블의 데이터 upsert종료.');
      }
    }
  } catch (e) {
    console.log(e);
    await page.close();
    await browser.close();
  }
}

module.exports.buyma = buyma;

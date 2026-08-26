const RAW_DATA = `DATE	DAY	GPAY	REASON	BALANCE	CASH	REASON	BALANCE	FANPAY	REASON	BALANCE	Total BALANCE
				1000.02			150			156	
2/9/2026	Monday	9900	iv amount	10900.02			150			156	11206.02
2/10/2026	Tuesday			10900.02			150			156	11206.02
2/11/2026	Wednesday			10900.02			150	-140	lunch	16	11066.02
2/12/2026	Thursday	14100	iv amount	25000.02			150	-10	sanks	6	25156.02
2/13/2026	Friday	4700	iv amount	29700.02			150			6	29856.02
2/14/2026	Saturday			29700.02			150			6	29856.02
2/15/2026	Sunday			29700.02			150			6	29856.02
2/16/2026	Monday			29700.02			150			6	29856.02
2/17/2026	Tuesday	-28700	iv amount	1000.02			150	10.32	super money(cash back)	16.32	1166.34
2/18/2026	Wednesday	300	abi(1500)	1300.02			150			16.32	1466.34
2/19/2026	Thursday			1300.02			150			16.32	1466.34
2/20/2026	Friday			1300.02			150			16.32	1466.34
2/21/2026	Saturday	-20	water bottle 	1280.02			150			16.32	1446.34
		-20	water bottle	1260.02			150			16.32	1426.34
		-10	choculate	1250.02			150			16.32	1416.34
2/22/2026	Sunday			1250.02			150			16.32	1416.34
2/23/2026	Monday	-300	ride	950.02			150			16.32	1116.34
		-80	mask	870.02			150			16.32	1036.34
2/24/2026	Tuesday			870.02			150			16.32	1036.34
2/25/2026	Wednesday			870.02			150			16.32	1036.34
2/26/2026	Thursday			870.02			150			16.32	1036.34
2/27/2026	Friday			870.02			150			16.32	1036.34
2/28/2026	Saturday			870.02			150			16.32	1036.34
3/1/2026	Sunday			870.02			150			16.32	1036.34
3/2/2026	Monday	-40	two chips (20) in vending 	830.02			150			16.32	996.34
3/3/2026	Tuesday	-100	arun sis ( gift)	730.02			150			16.32	896.34
3/4/2026	Wednesday	-40	ice cream in food court	690.02			150			16.32	856.34
3/5/2026	Thursday	-120	arun sis (cake)	570.02	750	appa cash	900			16.32	1486.34
3/6/2026	Friday			570.02	-150	petrol	750			16.32	1336.34
				570.02	-50	bus spare	700			16.32	1286.34
3/7/2026	Saturday			570.02	-50	water bottle	650			16.32	1236.34
				570.02	-120	juince	530			16.32	1116.34
				570.02	-200	barani	330			16.32	916.34
3/8/2026	Sunday			570.02			330			16.32	916.34
3/9/2026	Monday			570.02			330			16.32	916.34
3/10/2026	Tuesday	-44	ADB xerox	526.02			330			16.32	872.34
3/11/2026	Wednesday			526.02			330			16.32	872.34
3/12/2026	Thursday			526.02			330			16.32	872.34
3/13/2026	Friday	-20	exam fees 	506.02			330			16.32	852.34
3/14/2026	Saturday	-15	sms chares	491.02			330			16.32	837.34
3/15/2026	Sunday	-80	mouse pad	411.02			330			16.32	757.34
3/16/2026	Monday	-80	socks	331.02			330			16.32	677.34
3/17/2026	Tuesday	-100	hackaton 	231.02			330			16.32	577.34
3/18/2026	Wednesday	-10	xerox	221.02			330			16.32	567.34
3/19/2026	Thursday			221.02			330			16.32	567.34
3/20/2026	Friday			221.02			330			16.32	567.34
3/21/2026	Saturday			221.02			330			16.32	567.34
3/22/2026	Sunday			221.02	-20	bus ticket	310			16.32	547.34
3/23/2026	Monday	33	xerox amout	254.02			310			16.32	580.34
3/24/2026	Tuesday			254.02			310			16.32	580.34
3/25/2026	Wednesday	1000	appa amount	1254.02			310			16.32	1580.34
3/26/2026	Thursday	-117	hackton bus spare	1137.02			310			16.32	1463.34
3/27/2026	Friday	-50	iv exponse	1087.02			310	10.05	cash back	26.37	1423.39
3/28/2026	Saturday	19		1106.02	-300	shrit to sanjay sir	10			26.37	1142.39
3/29/2026	Sunday	500	pant (rat bit)	1606.02	-10	bus spare	0			26.37	1632.39
		-17	bus spare	1589.02			0			26.37	1615.39
3/30/2026	Monday			1589.02			0			26.37	1615.39
3/31/2026	Tuesday			1589.02			0			26.37	1615.39
4/1/2026	Wednesday			1589.02			0			26.37	1615.39
4/2/2026	Thursday			1589.02			0			26.37	1615.39
4/3/2026	Friday	-50	iv amount	1539.02			0			26.37	1565.39
4/4/2026	Saturday	-50	petrol	1489.02	1090	appa 	1090			26.37	2605.39
4/5/2026	Sunday	-80	haircut	1409.02			1090			26.37	2525.39
4/6/2026	Monday	-250	xerox 	1159.02	-40	bus ticket	1050			26.37	2235.39
4/7/2026	Tuesday			1159.02			1050			26.37	2235.39
4/8/2026	Wednesday			1159.02			1050			26.37	2235.39
4/9/2026	Thursday	-368	xerox	791.02			1050	12.14	cash back	38.51	1879.53
4/10/2026	Friday			791.02			1050			38.51	1879.53
4/11/2026	Saturday	-500	abi(500)	291.02			1050	14.1	gpay  cash back	52.61	1393.63
		-100	lunch	191.02			1050			52.61	1293.63
4/12/2026	Sunday			191.02			1050			52.61	1293.63
4/13/2026	Monday			191.02			1050			52.61	1293.63
4/14/2026	Tuesday	-20	xerox	171.02			1050			52.61	1273.63
4/15/2026	Wednesday			171.02			1050			52.61	1273.63
4/16/2026	Thursday			171.02			1050			52.61	1273.63
4/17/2026	Friday	-150	petrol	21.02			1050			52.61	1123.63
4/18/2026	Saturday			21.02			1050			52.61	1123.63
4/19/2026	Sunday	1000	account 	1021.02	-1000	account	50			52.61	1123.63
4/20/2026	Monday			1021.02			50			52.61	1123.63
4/21/2026	Tuesday			1021.02			50			52.61	1123.63
4/22/2026	Wednesday			1021.02	-40	bus spare	10			52.61	1083.63
4/23/2026	Thursday			1021.02	550		560			52.61	1633.63
4/24/2026	Friday			1021.02	-40	bus spare	520			52.61	1593.63
4/25/2026	Saturday			1021.02			520			52.61	1593.63
4/26/2026	Sunday			1021.02			520			52.61	1593.63
4/27/2026	Monday			1021.02			520			52.61	1593.63
4/28/2026	Tuesday	60	account	1081.02	-60	account	460			52.61	1593.63
4/29/2026	Wednesday	-80	food	1001.02	-440	publish	20			52.61	1073.63
4/30/2026	Thursday	-110	snacks	891.02	-20	snacks	0			52.61	943.63
5/1/2026	Friday	500	appa 	1391.02			0			52.61	1443.63
5/2/2026	Saturday			1391.02			0			52.61	1443.63
5/3/2026	Sunday			1391.02	240	appa	240			52.61	1683.63
5/4/2026	Monday			1391.02	-40	bus spare	200			52.61	1643.63
5/5/2026	Tuesday			1391.02			200			52.61	1643.63
5/6/2026	Wednesday	20	account	1411.02	-20	acount	180			52.61	1643.63
5/7/2026	Thursday	950	frame	2361.02			180			52.61	2593.63
5/8/2026	Friday			2361.02			180			52.61	2593.63
5/9/2026	Saturday	-200	food,snacks,	2161.02			180			52.61	2393.63
		-110	xerox	2051.02			180			52.61	2283.63
5/10/2026	Sunday	-1500	abi return	551.02			180			52.61	783.63
5/11/2026	Monday			551.02			180			52.61	783.63
5/12/2026	Tuesday			551.02			180			52.61	783.63
5/13/2026	Wednesday			551.02			180	34.93	cash back	87.54	818.56
5/14/2026	Thursday			551.02			180			87.54	818.56
5/15/2026	Friday			551.02			180			87.54	818.56
5/16/2026	Saturday			551.02			180			87.54	818.56
5/17/2026	Sunday	-87	barani cake	464.02			180	40	note waste 	127.54	771.56
				464.02			180	-25	ice cream	102.54	746.56
5/18/2026	Monday	300	frame,account	764.02	-100	account	80			102.54	946.56
5/19/2026	Tuesday	-72	dress(vineth mama's)	692.02	-40	bus sprare	40			102.54	834.56
		-40	juice	652.02			40			102.54	794.56
5/20/2026	Wednesday			652.02			40			102.54	794.56
5/21/2026	Thursday			652.02			40			102.54	794.56
5/22/2026	Friday			652.02			40			102.54	794.56
5/23/2026	Saturday	-236	depit card annual charges 	416.02	100	appa cash 	140			102.54	658.56
5/24/2026	Sunday	1000	srimathi return amount 	1416.02	-100	haircut	40			102.54	1558.56
5/25/2026	Monday	-20	haircut	1396.02			40			102.54	1538.56
5/26/2026	Tuesday			1396.02			40			102.54	1538.56
5/27/2026	Wednesday			1396.02			40			102.54	1538.56
5/28/2026	Thursday	-6	xerox	1390.02			40			102.54	1532.56
5/29/2026	Friday			1390.02			40			102.54	1532.56
5/30/2026	Saturday	1000	appa 	2390.02	100	appa	140			102.54	2632.56
5/31/2026	Sunday	30	naveen mouse pad	2420.02	-40	bus spare	100			102.54	2622.56
6/1/2026	Monday	-135	food 	2285.02	150	grandfather and amma	250			102.54	2637.56
6/2/2026	Tuesday	230	account	2515.02	-230	account	20			102.54	2637.56
6/3/2026	Wednesday	-80	note 2	2435.02			20			102.54	2557.56
6/4/2026	Thursday	-20	snacks	2415.02			20			102.54	2537.56
6/5/2026	Friday	800	inten	3215.02			20			102.54	3337.56
6/6/2026	Saturday	-60	snacks	3155.02			20			102.54	3277.56
6/7/2026	Sunday			3155.02			20			102.54	3277.56
6/8/2026	Monday	-100	juice	3055.02			20			102.54	3177.56
6/9/2026	Tuesday			3055.02			20			102.54	3177.56
6/10/2026	Wednesday	-60	snacks	2995.02			20			102.54	3117.56
6/11/2026	Thursday			2995.02			20			102.54	3117.56
6/12/2026	Friday	-4	xerox	2991.02			20			102.54	3113.56
6/13/2026	Saturday	-40	snacks	2951.02			20			102.54	3073.56
		-21	sms charges	2930.02			20			102.54	3052.56
6/14/2026	Sunday	-11	recharge	2919.02	-20	bus spare	0			102.54	3021.56
6/15/2026	Monday			2919.02	150	appa cash	150			102.54	3171.56
				2919.02	-50	bus spare	100			102.54	3121.56
6/16/2026	Tuesday			2919.02			100			102.54	3121.56
6/17/2026	Wednesday	-2000	account	919.02	-50	bus spare	50	2000	account	2102.54	3071.56
6/18/2026	Thursday	18340	corn amount	19259.02			50			2102.54	21411.56
6/19/2026	Friday	-17000	cash	2259.02			50			2102.54	4411.56
6/20/2026	Saturday	-700	intern	1559.02			50			2102.54	3711.56
		-70	cable	1489.02			50			2102.54	3641.56
6/21/2026	Sunday	200	cable	1689.02	190	appa	240			2102.54	4031.56
				1689.02	-40	bus sparse	200			2102.54	3991.56
6/22/2026	Monday	800	intern	2489.02			200			2102.54	4791.56
6/23/2026	Tuesday			2489.02			200			2102.54	4791.56
6/24/2026	Wednesday			2489.02			200			2102.54	4791.56
6/25/2026	Thursday			2489.02			200			2102.54	4791.56
6/26/2026	Friday	13	sbint 	2502.02			200			2102.54	4804.56
6/27/2026	Saturday	-20	snacks	2482.02			200			2102.54	4784.56
6/28/2026	Sunday			2482.02			200			2102.54	4784.56
6/29/2026	Monday	-280	doctor	2202.02			200			2102.54	4504.56
6/30/2026	Tuesday	1000	frame	3202.02			200			2102.54	5504.56
		650	frame	3852.02			200			2102.54	6154.56
7/1/2026	Wednesday	-900	cotten	2952.02			200			2102.54	5254.56
7/2/2026	Thursday			2952.02			200			2102.54	5254.56
7/3/2026	Friday	-1100	account	1852.02			200	1100	account	3202.54	5254.56
7/4/2026	Saturday	-237	mouse	1615.02			200			3202.54	5017.56
		-289	laptop stand	1326.02			200			3202.54	4728.56
7/5/2026	Sunday			1326.02			200			3202.54	4728.56
7/6/2026	Monday			1326.02			200			3202.54	4728.56
7/7/2026	Tuesday			1326.02			200			3202.54	4728.56
7/8/2026	Wednesday			1326.02			200			3202.54	4728.56
7/9/2026	Thursday			1326.02			200			3202.54	4728.56
7/10/2026	Friday			1326.02			200			3202.54	4728.56
7/11/2026	Saturday			1326.02			200			3202.54	4728.56
7/12/2026	Sunday			1326.02			200	-1000	manasa	2202.54	3728.56
7/13/2026	Monday			1326.02			200			2202.54	3728.56
7/14/2026	Tuesday			1326.02			200			2202.54	3728.56
7/15/2026	Wednesday			1326.02			200			2202.54	3728.56
7/16/2026	Thursday			1326.02			200			2202.54	3728.56
7/17/2026	Friday			1326.02			200			2202.54	3728.56
7/18/2026	Saturday			1326.02			200			2202.54	3728.56
7/19/2026	Sunday			1326.02			200			2202.54	3728.56
7/20/2026	Monday			1326.02			200			2202.54	3728.56
7/21/2026	Tuesday			1326.02			200			2202.54	3728.56
7/22/2026	Wednesday			1326.02			200			2202.54	3728.56
7/23/2026	Thursday			1326.02			200			2202.54	3728.56
7/24/2026	Friday			1326.02			200			2202.54	3728.56
7/25/2026	Saturday			1326.02	200	appa	400			2202.54	3928.56
7/26/2026	Sunday			1326.02	-50	bus spare	350			2202.54	3878.56
7/27/2026	Monday	-25	xerox	1301.02			350			2202.54	3853.56
7/28/2026	Tuesday	-10	cls fund	1291.02			350			2202.54	3843.56
7/29/2026	Wednesday	-120	dinner	1171.02			350			2202.54	3723.56
7/30/2026	Thursday			1171.02			350			2202.54	3723.56
7/31/2026	Friday	-8	xerox	1163.02			350			2202.54	3715.56
8/1/2026	Saturday			1163.02			350			2202.54	3715.56
8/2/2026	Sunday			1163.02			350			2202.54	3715.56
8/3/2026	Monday	-150	vineth mama's	1013.02			350			2202.54	3565.56
8/4/2026	Tuesday	30	nisanth	1043.02			350			2202.54	3595.56
8/5/2026	Wednesday	150	vineth mama's	1193.02			350			2202.54	3745.56
8/6/2026	Thursday	-168	xerox	1025.02			350			2202.54	3577.56
8/7/2026	Friday			1025.02			350	1000	manasa	3202.54	4577.56
8/8/2026	Saturday			1025.02	-50	bus spare	300			3202.54	4527.56
8/9/2026	Sunday			1025.02	50	appa amount	350			3202.54	4577.56
8/10/2026	Monday			1025.02			350	1	google reward	3203.54	4578.56
8/11/2026	Tuesday	-2	xerox	1023.02			350	-1003.54	nptel exam fees	2200	3573.02
8/12/2026	Wednesday			1023.02			350			2200	3573.02
8/13/2026	Thursday			1023.02			350			2200	3573.02
8/14/2026	Friday			1023.02	-100	barani	250			2200	3473.02
8/15/2026	Saturday			1023.02			250			2200	3473.02
8/16/2026	Sunday			1023.02	100	bharani	350	-55	snacks	2145	3518.02
8/17/2026	Monday	-4	aws account	1019.02			350	-2000	sujay iv	145	1514.02
8/18/2026	Tuesday			1019.02			350			145	1514.02
8/19/2026	Wednesday			1019.02			350			145	1514.02
8/20/2026	Thursday	-300	barani	719.02			350	-100	kishore	45	1114.02
8/21/2026	Friday	300	barani	1019.02			350			45	1414.02
8/22/2026	Saturday			1019.02	-100	appa	250			45	1314.02
8/23/2026	Sunday			1019.02			250			45	1314.02
8/24/2026	Monday			1019.02	-50	bus spare	200			45	1264.02
8/25/2026	Tuesday	500	appa 	1519.02			200			45	1764.02
8/26/2026	Wednesday	-180	food	1339.02			200			45	1584.02`;

function parseDate(dStr, fallbackDate) {
  if (!dStr || !dStr.trim()) return fallbackDate;
  const parts = dStr.trim().split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return fallbackDate;
}

function parseDataset() {
  const lines = RAW_DATA.trim().split('\n');
  const txList = [];

  txList.push({ date: '2026-02-08', account: 'GPAY', reason: 'Opening Balance', amount: 1000.02, type: 'in' });
  txList.push({ date: '2026-02-08', account: 'CASH', reason: 'Opening Balance', amount: 150.00, type: 'in' });
  txList.push({ date: '2026-02-08', account: 'FANPAY', reason: 'Opening Balance', amount: 156.00, type: 'in' });

  let currentDate = '2026-02-08';

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = line.split('\t');
    const dateRaw = cols[0] ? cols[0].trim() : '';
    if (dateRaw) {
      currentDate = parseDate(dateRaw, currentDate);
    }

    // GPAY: col 2 (amount), col 3 (reason)
    const gpayAmtStr = cols[2] ? cols[2].trim() : '';
    const gpayReason = cols[3] ? cols[3].trim() : '';
    if (gpayAmtStr && !isNaN(parseFloat(gpayAmtStr))) {
      const amtNum = parseFloat(gpayAmtStr);
      txList.push({
        date: currentDate,
        account: 'GPAY',
        reason: gpayReason || 'Transaction',
        amount: Math.abs(amtNum),
        type: amtNum >= 0 ? 'in' : 'out'
      });
    }

    // CASH: col 5 (amount), col 6 (reason)
    const cashAmtStr = cols[5] ? cols[5].trim() : '';
    const cashReason = cols[6] ? cols[6].trim() : '';
    if (cashAmtStr && !isNaN(parseFloat(cashAmtStr))) {
      const amtNum = parseFloat(cashAmtStr);
      txList.push({
        date: currentDate,
        account: 'CASH',
        reason: cashReason || 'Cash Transaction',
        amount: Math.abs(amtNum),
        type: amtNum >= 0 ? 'in' : 'out'
      });
    }

    // FANPAY: col 8 (amount), col 9 (reason)
    const fanpayAmtStr = cols[8] ? cols[8].trim() : '';
    const fanpayReason = cols[9] ? cols[9].trim() : '';
    if (fanpayAmtStr && !isNaN(parseFloat(fanpayAmtStr))) {
      const amtNum = parseFloat(fanpayAmtStr);
      txList.push({
        date: currentDate,
        account: 'FANPAY',
        reason: fanpayReason || 'Fanpay Transaction',
        amount: Math.abs(amtNum),
        type: amtNum >= 0 ? 'in' : 'out'
      });
    }
  }

  return txList;
}

function getCategoryMapping(reason, categories) {
  if (!reason || !categories || !categories.length) return null;
  const r = reason.toLowerCase();
  if (r.includes('food') || r.includes('lunch') || r.includes('dinner') || r.includes('snack') || r.includes('chips') || r.includes('ice cream') || r.includes('cake') || r.includes('juice') || r.includes('juince') || r.includes('choculate')) {
    const match = categories.find(c => c.name.toLowerCase().includes('food'));
    return match ? match.id : null;
  }
  if (r.includes('bus') || r.includes('petrol') || r.includes('ride') || r.includes('travel')) {
    const match = categories.find(c => c.name.toLowerCase().includes('transport'));
    return match ? match.id : null;
  }
  if (r.includes('xerox') || r.includes('exam') || r.includes('nptel') || r.includes('hackaton') || r.includes('note') || r.includes('education')) {
    const match = categories.find(c => c.name.toLowerCase().includes('education'));
    return match ? match.id : null;
  }
  if (r.includes('mouse') || r.includes('stand') || r.includes('dress') || r.includes('socks') || r.includes('pant') || r.includes('shrit') || r.includes('shopping')) {
    const match = categories.find(c => c.name.toLowerCase().includes('shopping'));
    return match ? match.id : null;
  }
  if (r.includes('doctor') || r.includes('haircut') || r.includes('mask') || r.includes('health')) {
    const match = categories.find(c => c.name.toLowerCase().includes('healthcare'));
    return match ? match.id : null;
  }
  if (r.includes('cable') || r.includes('recharge') || r.includes('sms') || r.includes('aws') || r.includes('depit') || r.includes('annual')) {
    const match = categories.find(c => c.name.toLowerCase().includes('bills'));
    return match ? match.id : null;
  }
  if (r.includes('intern') || r.includes('reward') || r.includes('cash back') || r.includes('salary') || r.includes('appa') || r.includes('amount')) {
    const match = categories.find(c => c.name.toLowerCase().includes('salary') || c.name.toLowerCase().includes('money'));
    return match ? match.id : null;
  }
  return null;
}

function ensureUserDataset(db, userId, callback) {
  if (!db || !userId) return callback && callback();

  const parsedTxns = parseDataset();

  // Check how many transactions exist for this user
  db.get(
    'SELECT count(t.id) as count FROM transactions t JOIN accounts a ON t.account_id = a.id WHERE a.user_id = ?',
    [userId],
    (err, row) => {
      if (err) {
        console.error('Error checking transactions for user:', err);
        return callback && callback(err);
      }

      // If user already has the full latest dataset, no need to re-seed
      if (row && row.count >= parsedTxns.length) {
        return callback && callback(null, row.count);
      }

      console.log(`🌱 Seeding ${parsedTxns.length}-item MoneyFlow dataset for user ID ${userId}...`);

      db.serialize(() => {
        // Clean empty unused default accounts
        db.run(
          "DELETE FROM accounts WHERE user_id = ? AND name NOT IN ('GPAY', 'CASH', 'FANPAY')",
          [userId]
        );

        // Create accounts GPAY, CASH, FANPAY
        const accountMap = {};
        const accNames = ['GPAY', 'CASH', 'FANPAY'];
        let accountsProcessed = 0;

        accNames.forEach(accName => {
          db.get('SELECT id FROM accounts WHERE name = ? AND user_id = ?', [accName, userId], (accErr, accRow) => {
            if (accRow) {
              accountMap[accName] = accRow.id;
              accountsProcessed++;
              if (accountsProcessed === accNames.length) insertTransactions();
            } else {
              db.run('INSERT INTO accounts (name, user_id) VALUES (?, ?)', [accName, userId], function (insErr) {
                accountMap[accName] = this.lastID;
                accountsProcessed++;
                if (accountsProcessed === accNames.length) insertTransactions();
              });
            }
          });
        });

        function insertTransactions() {
          const accIds = Object.values(accountMap);
          db.run(`DELETE FROM transactions WHERE account_id IN (${accIds.join(',')})`, (delErr) => {
            db.all('SELECT id, name FROM categories', (catErr, cats) => {
              const categories = cats || [];
              const stmt = db.prepare('INSERT INTO transactions (date, account_id, category_id, reason, amount, type) VALUES (?, ?, ?, ?, ?, ?)');

              parsedTxns.forEach(tx => {
                const catId = getCategoryMapping(tx.reason, categories);
                const accId = accountMap[tx.account];
                if (accId) {
                  stmt.run(tx.date, accId, catId, tx.reason, tx.amount, tx.type);
                }
              });

              stmt.finalize((finErr) => {
                if (finErr) console.error('Error finalizing seed insert:', finErr);
                else console.log(`✓ Seeded ${parsedTxns.length} transactions for user ID ${userId}.`);
                if (callback) callback(finErr, parsedTxns.length);
              });
            });
          });
        }
      });
    }
  );
}

module.exports = { ensureUserDataset, parseDataset, RAW_DATA };

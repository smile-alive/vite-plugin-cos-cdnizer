import React, { useState } from 'react';
import Roboto from './assets/Roboto.svg';
import Runner from './assets/Runner.svg';
import './app.css';

export default function App() {
	const [rangeValue, setRangeValue] = useState<string>('50');

	return (
		<div className='compare' style={{ '--pos': `${rangeValue}%` } as React.CSSProperties}>
			<section className='before'>
				<img src={Runner} />
			</section>
			<section className='after'>
				<img src={Roboto} />
			</section>
			<input
				type='range'
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRangeValue(e.target.value)}
			/>
		</div>
	);
}
